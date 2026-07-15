"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  RoadIssueCategory,
  RoadIssueStatus,
} from "@/lib/domain/road-issue-options";
import type {
  PublicIssueRankingRow,
  PublicIssueRankingType,
} from "@/lib/road-issues/types";
import { createOptionalClient } from "@/lib/supabase/browser";

type UsePublicIssueRankingsOptions = {
  category?: RoadIssueCategory | null;
  pageSize?: number;
  status?: RoadIssueStatus | null;
};

type UsePublicIssueRankingsResult = {
  error: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
  rankings: PublicIssueRankingRow[];
  refetch: () => Promise<PublicIssueRankingRow[]>;
};

export function usePublicIssueRankings(
  rankingType: PublicIssueRankingType,
  options: UsePublicIssueRankingsOptions = {},
): UsePublicIssueRankingsResult {
  const supabase = useMemo(() => createOptionalClient(), []);
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 12, 50));
  const category = options.category ?? null;
  const status = options.status ?? null;
  const [rankings, setRankings] = useState<PublicIssueRankingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const requestSequence = ++requestSequenceRef.current;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setRankings([]);
      }
      setError(null);

      if (!supabase) {
        setHasMore(false);
        setError(
          "Supabase bağlantısı için NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY gerekli.",
        );
        setIsLoading(false);
        setIsLoadingMore(false);
        return [];
      }

      const { data, error: rpcError } = await supabase.rpc(
        "get_paginated_issues",
        {
          p_category: category,
          p_limit: pageSize,
          p_offset: offset,
          p_sort_by: toDatabaseSort(rankingType),
          p_status: status,
        },
      );

      if (requestSequence !== requestSequenceRef.current) {
        return [];
      }

      if (rpcError) {
        if (process.env.NODE_ENV === "development") {
          console.error("get_paginated_issues RPC error", rpcError);
        }

        setHasMore(false);
        setError("Yol sorunları yüklenirken bir hata oluştu.");
        setIsLoading(false);
        setIsLoadingMore(false);
        return [];
      }

      const rows = parseRankingRows(data);
      setRankings((current) => (append ? [...current, ...rows] : rows));
      setHasMore(rows.length === pageSize);
      setIsLoading(false);
      setIsLoadingMore(false);
      return rows;
    },
    [category, pageSize, rankingType, status, supabase],
  );

  useEffect(() => {
    void fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) {
      return;
    }

    await fetchPage(rankings.length, true);
  }, [fetchPage, hasMore, isLoading, isLoadingMore, rankings.length]);

  const refetch = useCallback(async () => fetchPage(0, false), [fetchPage]);

  return {
    error,
    hasMore,
    isLoading,
    isLoadingMore,
    loadMore,
    rankings,
    refetch,
  };
}

function toDatabaseSort(rankingType: PublicIssueRankingType) {
  return rankingType === "recently_added" ? "newest" : rankingType;
}

function parseRankingRows(value: unknown): PublicIssueRankingRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;

    if (
      typeof row.id !== "string" ||
      typeof row.category !== "string" ||
      typeof row.severity !== "string" ||
      typeof row.status !== "string" ||
      typeof row.first_reported_at !== "string" ||
      typeof row.created_at !== "string" ||
      typeof row.updated_at !== "string"
    ) {
      return [];
    }

    return [
      {
        category: row.category as PublicIssueRankingRow["category"],
        city: textOrNull(row.city),
        created_at: row.created_at,
        damage_count: numberField(row.damage_count),
        district: textOrNull(row.district),
        false_report_count: numberField(row.false_report_count),
        first_reported_at: row.first_reported_at,
        id: row.id,
        last_verified_at: textOrNull(row.last_verified_at),
        latitude: numberField(row.latitude),
        location_label: textOrNull(row.location_label),
        longitude: numberField(row.longitude),
        neighborhood: textOrNull(row.neighborhood),
        open_days: numberField(row.open_days),
        reporter_count: numberField(row.reporter_count),
        severity: row.severity as PublicIssueRankingRow["severity"],
        severity_score_avg: numberField(row.severity_score_avg),
        solved_count: numberField(row.solved_count),
        status: row.status as PublicIssueRankingRow["status"],
        updated_at: row.updated_at,
        verification_count: numberField(row.verification_count),
        watcher_count: numberField(row.watcher_count),
      },
    ];
  });
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}
