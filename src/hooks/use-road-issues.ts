"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createOptionalClient } from "@/lib/supabase/browser";
import type {
  PublicRoadIssue,
  RoadIssueFilters,
} from "@/lib/road-issues/types";

type UseRoadIssuesResult = {
  issues: PublicRoadIssue[];
  filteredIssues: PublicRoadIssue[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<PublicRoadIssue[]>;
};

const ROAD_ISSUE_COLUMNS =
  "id, latitude, longitude, city, district, neighborhood, location_label, category, severity, status, first_reported_at, last_verified_at, verification_count, damage_count, solved_count, false_report_count, reporter_count, watcher_count, severity_score_avg, created_at, updated_at";
const FALLBACK_ROAD_ISSUE_COLUMNS =
  "id, latitude, longitude, category, severity, status, first_reported_at, last_verified_at, verification_count, damage_count, solved_count, false_report_count, reporter_count, severity_score_avg, created_at, updated_at";

export function useRoadIssues(filters: RoadIssueFilters): UseRoadIssuesResult {
  const [issues, setIssues] = useState<PublicRoadIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIssues = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const supabase = createOptionalClient();

    if (!supabase) {
      setIssues([]);
      setError(
        "Supabase bağlantısı için NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY gerekli.",
      );
      setIsLoading(false);
      return [];
    }

    const result = await supabase
      .from("road_issue_public_stats")
      .select(ROAD_ISSUE_COLUMNS)
      .order("last_verified_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    let rows = result.data as Record<string, unknown>[] | null;
    let queryError = result.error;

    if (queryError && isMissingLocationColumnError(queryError.message)) {
      const fallbackResult = await supabase
        .from("road_issue_public_stats")
        .select(FALLBACK_ROAD_ISSUE_COLUMNS)
        .order("last_verified_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      rows = fallbackResult.data as Record<string, unknown>[] | null;
      queryError = fallbackResult.error;
    }

    if (queryError) {
      if (process.env.NODE_ENV === "development") {
        console.error("road_issue_public_stats query error", queryError);
      }

      setIssues([]);
      setError("Yol sorunları yüklenemedi. Lütfen tekrar dene.");
      setIsLoading(false);
      return [];
    }

    const loadedIssues = (rows ?? []).map(withLocationFallback) as PublicRoadIssue[];
    setIssues(loadedIssues);
    setError(null);
    setIsLoading(false);
    return loadedIssues;
  }, []);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      const categoryMatches =
        filters.categories.length === 0 ||
        filters.categories.includes(issue.category);
      const statusMatches =
        filters.status === "all" || issue.status === filters.status;

      return categoryMatches && statusMatches;
    });
  }, [filters.categories, filters.status, issues]);

  return {
    issues,
    filteredIssues,
    isLoading,
    error,
    refetch: loadIssues,
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
