"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createOptionalClient } from "@/lib/supabase/browser";
import type {
  PublicRoadIssue,
  RoadIssueFilters,
} from "@/lib/road-issues/types";

export type RoadIssueMapViewport = {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
  zoom: number;
};

type UseRoadIssuesResult = {
  issues: PublicRoadIssue[];
  filteredIssues: PublicRoadIssue[];
  isLoading: boolean;
  error: string | null;
  fetchIssueById: (issueId: string) => Promise<PublicRoadIssue | null>;
  refetch: () => Promise<PublicRoadIssue[]>;
};

const ROAD_ISSUE_COLUMNS =
  "id, latitude, longitude, city, district, neighborhood, location_label, category, severity, status, first_reported_at, last_verified_at, verification_count, damage_count, solved_count, false_report_count, reporter_count, watcher_count, severity_score_avg, created_at, updated_at";
const FALLBACK_ROAD_ISSUE_COLUMNS =
  "id, latitude, longitude, category, severity, status, first_reported_at, last_verified_at, verification_count, damage_count, solved_count, false_report_count, reporter_count, severity_score_avg, created_at, updated_at";
const MAX_CACHE_ENTRIES = 24;

export function useRoadIssues(
  filters: RoadIssueFilters,
  viewport: RoadIssueMapViewport | null,
): UseRoadIssuesResult {
  const [issues, setIssues] = useState<PublicRoadIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, PublicRoadIssue[]>());
  const issuesRef = useRef<PublicRoadIssue[]>([]);
  const requestSequenceRef = useRef(0);
  const categoryFilter = useMemo(
    () => [...filters.categories].sort().join(","),
    [filters.categories],
  );
  const statusFilter = filters.status === "all" ? "" : filters.status;
  const cacheKey = useMemo(() => {
    if (!viewport) {
      return null;
    }

    return [
      viewport.minLatitude.toFixed(5),
      viewport.minLongitude.toFixed(5),
      viewport.maxLatitude.toFixed(5),
      viewport.maxLongitude.toFixed(5),
      viewport.zoom,
      categoryFilter,
      statusFilter,
    ].join(":");
  }, [categoryFilter, statusFilter, viewport]);

  const commitIssues = useCallback((nextIssues: PublicRoadIssue[]) => {
    issuesRef.current = nextIssues;
    setIssues(nextIssues);
  }, []);

  const loadIssues = useCallback(
    async (force: boolean) => {
      if (!viewport || !cacheKey) {
        return issuesRef.current;
      }

      const requestSequence = ++requestSequenceRef.current;
      const cachedIssues = cacheRef.current.get(cacheKey);

      if (!force && cachedIssues) {
        commitIssues(cachedIssues);
        setError(null);
        setIsLoading(false);
        return cachedIssues;
      }

      setIsLoading(true);
      setError(null);

      const supabase = createOptionalClient();

      if (!supabase) {
        if (requestSequence === requestSequenceRef.current) {
          commitIssues([]);
          setError(
            "Supabase bağlantısı için NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY gerekli.",
          );
          setIsLoading(false);
        }

        return [];
      }

      const { data, error: rpcError } = await supabase.rpc(
        "get_public_issues_in_bbox",
        {
          p_category_filter: categoryFilter || null,
          p_max_lat: viewport.maxLatitude,
          p_max_lng: viewport.maxLongitude,
          p_min_lat: viewport.minLatitude,
          p_min_lng: viewport.minLongitude,
          p_status_filter: statusFilter || null,
          p_zoom: viewport.zoom,
        },
      );

      if (requestSequence !== requestSequenceRef.current) {
        return issuesRef.current;
      }

      if (rpcError) {
        if (process.env.NODE_ENV === "development") {
          console.error("get_public_issues_in_bbox RPC error", rpcError);
        }

        commitIssues([]);
        setError("Yol sorunları yüklenemedi. Lütfen tekrar dene.");
        setIsLoading(false);
        return [];
      }

      const loadedIssues = ((data ?? []) as Record<string, unknown>[]).map(
        withLocationFallback,
      ) as PublicRoadIssue[];

      rememberCacheEntry(cacheRef.current, cacheKey, loadedIssues);
      commitIssues(loadedIssues);
      setError(null);
      setIsLoading(false);
      return loadedIssues;
    },
    [cacheKey, categoryFilter, commitIssues, statusFilter, viewport],
  );

  useEffect(() => {
    void loadIssues(false);
  }, [loadIssues]);

  const refetch = useCallback(async () => loadIssues(true), [loadIssues]);

  const fetchIssueById = useCallback(async (issueId: string) => {
    const supabase = createOptionalClient();

    if (!supabase) {
      return null;
    }

    const result = await supabase
      .from("road_issue_public_stats")
      .select(ROAD_ISSUE_COLUMNS)
      .eq("id", issueId)
      .maybeSingle();
    let row = result.data as Record<string, unknown> | null;
    let queryError = result.error;

    if (queryError && isMissingLocationColumnError(queryError.message)) {
      const fallbackResult = await supabase
        .from("road_issue_public_stats")
        .select(FALLBACK_ROAD_ISSUE_COLUMNS)
        .eq("id", issueId)
        .maybeSingle();

      row = fallbackResult.data as Record<string, unknown> | null;
      queryError = fallbackResult.error;
    }

    if (queryError) {
      if (process.env.NODE_ENV === "development") {
        console.error("road issue detail query error", queryError);
      }

      return null;
    }

    return row ? (withLocationFallback(row) as PublicRoadIssue) : null;
  }, []);

  return {
    issues,
    filteredIssues: issues,
    isLoading,
    error,
    fetchIssueById,
    refetch,
  };
}

function rememberCacheEntry(
  cache: Map<string, PublicRoadIssue[]>,
  key: string,
  issues: PublicRoadIssue[],
) {
  cache.delete(key);
  cache.set(key, issues);

  if (cache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = cache.keys().next().value;

  if (typeof oldestKey === "string") {
    cache.delete(oldestKey);
  }
}

function withLocationFallback(issue: Record<string, unknown>) {
  return {
    ...issue,
    city: typeof issue.city === "string" ? issue.city : null,
    district: typeof issue.district === "string" ? issue.district : null,
    location_label:
      typeof issue.location_label === "string" ? issue.location_label : null,
    neighborhood:
      typeof issue.neighborhood === "string" ? issue.neighborhood : null,
    watcher_count:
      typeof issue.watcher_count === "number" ? issue.watcher_count : 0,
  };
}

function isMissingLocationColumnError(message: string) {
  return (
    message.includes("city") ||
    message.includes("district") ||
    message.includes("neighborhood") ||
    message.includes("location_label") ||
    message.includes("watcher_count")
  );
}
