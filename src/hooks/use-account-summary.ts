"use client";

import { useCallback, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountSummary = {
  confirmedPoints: number;
  pendingPoints: number;
  levelLabel: string;
  activeReportCount: number;
  watchedIssueCount: number;
  verificationCount: number;
  damageReportCount: number;
};

export const emptyAccountSummary: AccountSummary = {
  activeReportCount: 0,
  confirmedPoints: 0,
  damageReportCount: 0,
  levelLabel: "Yeni Katkıcı",
  pendingPoints: 0,
  verificationCount: 0,
  watchedIssueCount: 0,
};

export function useAccountSummary(supabase: SupabaseClient | null) {
  const [summary, setSummary] = useState<AccountSummary>(emptyAccountSummary);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!supabase) {
      setSummary(emptyAccountSummary);
      return;
    }

    setIsLoadingSummary(true);
    setSummaryError(null);

    const [
      { data: scoreData, error: scoreError },
      { data: dashboardData, error: dashboardError },
    ] = await Promise.all([
      supabase.rpc("get_my_score_summary"),
      supabase.rpc("get_my_civic_dashboard"),
    ]);

    setIsLoadingSummary(false);

    if (scoreError || dashboardError) {
      if (process.env.NODE_ENV === "development") {
        if (scoreError) {
          console.error("get_my_score_summary RPC error", scoreError);
        }

        if (dashboardError) {
          console.error("get_my_civic_dashboard RPC error", dashboardError);
        }
      }

      setSummary(emptyAccountSummary);
      setSummaryError("Etki bilgileri yüklenemedi.");
      return;
    }

    const scoreRecord = firstRecord(scoreData);
    const dashboardRecord = firstRecord(dashboardData);

    setSummary({
      activeReportCount: numberField(dashboardRecord?.active_report_count),
      confirmedPoints: numberField(scoreRecord?.confirmed_points),
      damageReportCount: numberField(dashboardRecord?.damage_report_count),
      levelLabel:
        typeof scoreRecord?.level_label === "string"
          ? scoreRecord.level_label
          : "Yeni Katkıcı",
      pendingPoints: numberField(scoreRecord?.pending_points),
      verificationCount: numberField(dashboardRecord?.verification_count),
      watchedIssueCount: numberField(dashboardRecord?.watched_issue_count),
    });
  }, [supabase]);

  const resetSummary = useCallback(() => {
    setSummary(emptyAccountSummary);
    setSummaryError(null);
    setIsLoadingSummary(false);
  }, []);

  return {
    isLoadingSummary,
    loadSummary,
    resetSummary,
    summary,
    summaryError,
  };
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  const result = Array.isArray(value) ? value[0] : value;

  return result && typeof result === "object"
    ? (result as Record<string, unknown>)
    : null;
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
