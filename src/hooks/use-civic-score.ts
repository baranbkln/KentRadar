"use client";

import { useCallback, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CivicScoreEvent,
  CivicScoreSummary,
  ScoreEventStatus,
} from "@/lib/score/types";

export const emptyCivicScoreSummary: CivicScoreSummary = {
  confirmed_points: 0,
  ignored_points: 0,
  level_label: "Yeni Katkıcı",
  pending_points: 0,
  reversed_points: 0,
  updated_at: null,
};

export function useCivicScore(supabase: SupabaseClient | null) {
  const [scoreSummary, setScoreSummary] = useState<CivicScoreSummary>(
    emptyCivicScoreSummary,
  );
  const [scoreEvents, setScoreEvents] = useState<CivicScoreEvent[]>([]);
  const [isLoadingScore, setIsLoadingScore] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const loadScore = useCallback(async () => {
    if (!supabase) {
      setScoreSummary(emptyCivicScoreSummary);
      setScoreEvents([]);
      return;
    }

    setIsLoadingScore(true);
    setScoreError(null);

    const [
      { data: summaryData, error: summaryError },
      { data: eventsData, error: eventsError },
    ] = await Promise.all([
      supabase.rpc("get_my_score_summary"),
      supabase.rpc("get_my_score_events", { p_limit: 10 }),
    ]);

    setIsLoadingScore(false);

    if (summaryError || eventsError) {
      if (process.env.NODE_ENV === "development") {
        if (summaryError) {
          console.error("get_my_score_summary RPC error", summaryError);
        }

        if (eventsError) {
          console.error("get_my_score_events RPC error", eventsError);
        }
      }

      setScoreSummary(emptyCivicScoreSummary);
      setScoreEvents([]);
      setScoreError("Etki puanı bilgileri yüklenemedi.");
      return;
    }

    setScoreSummary(parseScoreSummary(summaryData));
    setScoreEvents(parseScoreEvents(eventsData));
  }, [supabase]);

  const resetScore = useCallback(() => {
    setScoreSummary(emptyCivicScoreSummary);
    setScoreEvents([]);
    setScoreError(null);
    setIsLoadingScore(false);
  }, []);

  return {
    isLoadingScore,
    loadScore,
    resetScore,
    scoreError,
    scoreEvents,
    scoreSummary,
  };
}

function parseScoreSummary(value: unknown): CivicScoreSummary {
  const result = Array.isArray(value) ? value[0] : value;

  if (!result || typeof result !== "object") {
    return emptyCivicScoreSummary;
  }

  const record = result as Record<string, unknown>;

  return {
    confirmed_points: numberField(record.confirmed_points),
    ignored_points: numberField(record.ignored_points),
    level_label:
      typeof record.level_label === "string"
        ? record.level_label
        : "Yeni Katkıcı",
    pending_points: numberField(record.pending_points),
    reversed_points: numberField(record.reversed_points),
    updated_at: typeof record.updated_at === "string" ? record.updated_at : null,
  };
}

function parseScoreEvents(value: unknown): CivicScoreEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;

    if (
      typeof record.event_type !== "string" ||
      typeof record.status !== "string" ||
      typeof record.created_at !== "string"
    ) {
      return [];
    }

    return [
      {
        created_at: record.created_at,
        event_type: record.event_type,
        finalized_at:
          typeof record.finalized_at === "string" ? record.finalized_at : null,
        issue_id: typeof record.issue_id === "string" ? record.issue_id : null,
        points: numberField(record.points),
        reason: typeof record.reason === "string" ? record.reason : null,
        reversed_at:
          typeof record.reversed_at === "string" ? record.reversed_at : null,
        status: record.status as ScoreEventStatus,
      },
    ];
  });
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
