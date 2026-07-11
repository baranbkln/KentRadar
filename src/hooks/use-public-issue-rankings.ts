"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateOpenDays } from "@/lib/road-issues/intensity";
import type {
  PublicIssueRankingRow,
  PublicIssueRankingType,
} from "@/lib/road-issues/types";
import { createOptionalClient } from "@/lib/supabase/browser";

type UsePublicIssueRankingsResult = {
  error: string | null;
  isLoading: boolean;
  rankings: PublicIssueRankingRow[];
  refetch: () => Promise<PublicIssueRankingRow[]>;
};

const ROAD_ISSUE_COLUMNS =
  "id, latitude, longitude, city, district, neighborhood, location_label, category, severity, status, first_reported_at, last_verified_at, verification_count, damage_count, solved_count, false_report_count, reporter_count, watcher_count, severity_score_avg, created_at, updated_at";
const FALLBACK_ROAD_ISSUE_COLUMNS =
  "id, latitude, longitude, category, severity, status, first_reported_at, last_verified_at, verification_count, damage_count, solved_count, false_report_count, reporter_count, severity_score_avg, created_at, updated_at";

export function usePublicIssueRankings(
  rankingType: PublicIssueRankingType,
): UsePublicIssueRankingsResult {
  const [issues, setIssues] = useState<PublicIssueRankingRow[]>([]);
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
      .select(ROAD_ISSUE_COLUMNS);
    let rows = result.data as Record<string, unknown>[] | null;
    let queryError = result.error;

    if (queryError && isMissingLocationColumnError(queryError.message)) {
      const fallbackResult = await supabase
        .from("road_issue_public_stats")
        .select(FALLBACK_ROAD_ISSUE_COLUMNS);

      rows = fallbackResult.data as Record<string, unknown>[] | null;
      queryError = fallbackResult.error;
    }

    if (queryError) {
      if (process.env.NODE_ENV === "development") {
        console.error("road_issue_public_stats query error", queryError);
      }

      setIssues([]);
      setError("Yol sorunları yüklenirken bir hata oluştu.");
      setIsLoading(false);
      return [];
    }

    const loadedIssues = (rows ?? []).map((issue) => ({
      ...withLocationFallback(issue),
      open_days: calculateOpenDays(String(issue.first_reported_at ?? "")),
    })) as PublicIssueRankingRow[];

    setIssues(loadedIssues);
    setError(null);
    setIsLoading(false);
    return loadedIssues;
  }, []);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const rankings = useMemo(() => {
    return rankIssues(issues, rankingType).slice(0, 50);
  }, [issues, rankingType]);

  return {
    error,
    isLoading,
    rankings,
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

function rankIssues(
  issues: PublicIssueRankingRow[],
  rankingType: PublicIssueRankingType,
) {
  const rankingIssues = issues.filter((issue) => {
    if (rankingType === "most_verified") {
      return issue.verification_count > 0;
    }

    if (rankingType === "most_damage") {
      return issue.damage_count > 0;
    }

    if (rankingType === "recently_verified") {
      return Boolean(issue.last_verified_at);
    }

    return true;
  });

  return rankingIssues.sort((left, right) => {
    if (rankingType === "most_reported") {
      return compareNumbers(
        right.reporter_count,
        left.reporter_count,
        right.updated_at,
        left.updated_at,
      );
    }

    if (rankingType === "most_verified") {
      return compareNumbers(
        right.verification_count,
        left.verification_count,
        right.last_verified_at,
        left.last_verified_at,
      );
    }

    if (rankingType === "most_damage") {
      return compareNumbers(
        right.damage_count,
        left.damage_count,
        right.updated_at,
        left.updated_at,
      );
    }

    if (rankingType === "longest_open") {
      return compareNumbers(
        right.open_days,
        left.open_days,
        left.first_reported_at,
        right.first_reported_at,
      );
    }

    if (rankingType === "recently_verified") {
      return compareDates(right.last_verified_at, left.last_verified_at);
    }

    return compareDates(right.created_at, left.created_at);
  });
}

function compareNumbers(
  rightValue: number,
  leftValue: number,
  rightTieDate: string | null,
  leftTieDate: string | null,
) {
  if (rightValue !== leftValue) {
    return rightValue - leftValue;
  }

  return compareDates(rightTieDate, leftTieDate);
}

function compareDates(rightDate: string | null, leftDate: string | null) {
  const rightTime = rightDate ? new Date(rightDate).getTime() : 0;
  const leftTime = leftDate ? new Date(leftDate).getTime() : 0;

  return rightTime - leftTime;
}
