"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createOptionalClient } from "@/lib/supabase/browser";
import type {
  PublicRoadIssue,
  RoadIssueMapCluster,
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
  clusters: RoadIssueMapCluster[];
  filteredIssues: PublicRoadIssue[];
  isLoading: boolean;
  error: string | null;
  fetchIssueById: (issueId: string) => Promise<PublicRoadIssue | null>;
  refetch: () => Promise<PublicRoadIssue[]>;
};

type RoadIssueMapData = {
  issues: PublicRoadIssue[];
  clusters: RoadIssueMapCluster[];
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
  const [clusters, setClusters] = useState<RoadIssueMapCluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, RoadIssueMapData>());
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

  const commitMapData = useCallback((nextData: RoadIssueMapData) => {
    issuesRef.current = nextData.issues;
    setIssues(nextData.issues);
    setClusters(nextData.clusters);
  }, []);

  const loadIssues = useCallback(
    async (force: boolean) => {
      if (!viewport || !cacheKey) {
        return issuesRef.current;
      }

      const requestSequence = ++requestSequenceRef.current;
      const cachedData = cacheRef.current.get(cacheKey);

      if (!force && cachedData) {
        commitMapData(cachedData);
        setError(null);
        setIsLoading(false);
        return cachedData.issues;
      }

      setIsLoading(true);
      setError(null);

      const supabase = createOptionalClient();

      if (!supabase) {
        if (requestSequence === requestSequenceRef.current) {
          commitMapData({ clusters: [], issues: [] });
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

        commitMapData({ clusters: [], issues: [] });
        setError("Yol sorunları yüklenemedi. Lütfen tekrar dene.");
        setIsLoading(false);
        return [];
      }

      const loadedData = parseMapRows(
        (data ?? []) as Record<string, unknown>[],
      );

      rememberCacheEntry(cacheRef.current, cacheKey, loadedData);
      commitMapData(loadedData);
      setError(null);
      setIsLoading(false);
      return loadedData.issues;
    },
    [cacheKey, categoryFilter, commitMapData, statusFilter, viewport],
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
    clusters,
    filteredIssues: issues,
    isLoading,
    error,
    fetchIssueById,
    refetch,
  };
}

function rememberCacheEntry(
  cache: Map<string, RoadIssueMapData>,
  key: string,
  data: RoadIssueMapData,
) {
  cache.delete(key);
  cache.set(key, data);

  if (cache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = cache.keys().next().value;

  if (typeof oldestKey === "string") {
    cache.delete(oldestKey);
  }
}

function parseMapRows(rows: Record<string, unknown>[]): RoadIssueMapData {
  const issues: PublicRoadIssue[] = [];
  const clusters: RoadIssueMapCluster[] = [];

  for (const row of rows) {
    if (row.result_type === "cluster") {
      const cluster = parseClusterRow(row);

      if (cluster) {
        clusters.push(cluster);
      }

      continue;
    }

    issues.push(withLocationFallback(row) as PublicRoadIssue);
  }

  return { clusters, issues };
}

function parseClusterRow(
  row: Record<string, unknown>,
): RoadIssueMapCluster | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  const issueCount = Number(row.cluster_count);
  const minLatitude = Number(row.cluster_min_latitude);
  const minLongitude = Number(row.cluster_min_longitude);
  const maxLatitude = Number(row.cluster_max_latitude);
  const maxLongitude = Number(row.cluster_max_longitude);

  if (
    typeof row.cluster_id !== "string" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isInteger(issueCount) ||
    issueCount < 1 ||
    !Number.isFinite(minLatitude) ||
    !Number.isFinite(minLongitude) ||
    !Number.isFinite(maxLatitude) ||
    !Number.isFinite(maxLongitude)
  ) {
    return null;
  }

  return {
    bounds: {
      maxLatitude,
      maxLongitude,
      minLatitude,
      minLongitude,
    },
    id: row.cluster_id,
    issueCount,
    latitude,
    longitude,
  };
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
