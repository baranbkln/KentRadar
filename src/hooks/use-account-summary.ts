"use client";

import { useCallback, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountSummary = {
  confirmedPoints: number;
  pendingPoints: number;
  levelLabel: string;
  globalRank: number | null;
  currentStreakDays: number;
  longestStreakDays: number;
  activeReportCount: number;
  resolvedCount: number;
  watchedIssueCount: number;
  verificationCount: number;
  damageReportCount: number;
  username: string | null;
  avatarStyle: string;
};

export const emptyAccountSummary: AccountSummary = {
  activeReportCount: 0,
  confirmedPoints: 0,
  currentStreakDays: 0,
  damageReportCount: 0,
  levelLabel: "Yeni Katkıcı",
  globalRank: null,
  longestStreakDays: 0,
  pendingPoints: 0,
  resolvedCount: 0,
  verificationCount: 0,
  watchedIssueCount: 0,
  username: null,
  avatarStyle: "cyan_user",
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

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const profileRequest = user
      ? supabase
          .from("profiles")
          .select("username, avatar_style")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const [
      { data: commandCenterData, error: commandCenterError },
      { data: dashboardData, error: dashboardError },
      { data: profileData, error: profileError },
    ] = await Promise.all([
      supabase.rpc("get_my_command_center"),
      supabase.rpc("get_my_civic_dashboard"),
      profileRequest,
    ]);

    setIsLoadingSummary(false);

    if (commandCenterError || dashboardError) {
      if (process.env.NODE_ENV === "development") {
        if (commandCenterError) {
          console.error("get_my_command_center RPC error", commandCenterError);
        }

        if (dashboardError) {
          console.error("get_my_civic_dashboard RPC error", dashboardError);
        }
      }

      setSummary(emptyAccountSummary);
      setSummaryError("Etki bilgileri yüklenemedi.");
      return;
    }

    const commandCenterRecord = firstRecord(commandCenterData);
    const dashboardRecord = firstRecord(dashboardData);

    if (profileError && process.env.NODE_ENV === "development") {
      console.warn("account profile query error", profileError);
    }

    setSummary({
      activeReportCount: numberField(dashboardRecord?.active_report_count),
      confirmedPoints: numberField(commandCenterRecord?.confirmed_points),
      currentStreakDays: numberField(
        commandCenterRecord?.current_streak_days,
      ),
      damageReportCount: numberField(dashboardRecord?.damage_report_count),
      levelLabel:
        typeof commandCenterRecord?.level_label === "string"
          ? commandCenterRecord.level_label
          : "Yeni Katkıcı",
      globalRank: nullableNumberField(commandCenterRecord?.global_rank),
      longestStreakDays: numberField(
        commandCenterRecord?.longest_streak_days,
      ),
      pendingPoints: numberField(commandCenterRecord?.pending_points),
      resolvedCount: numberField(
        commandCenterRecord?.resolved_count ??
          dashboardRecord?.resolved_count,
      ),
      verificationCount: numberField(dashboardRecord?.verification_count),
      watchedIssueCount: numberField(dashboardRecord?.watched_issue_count),
      username:
        typeof profileData?.username === "string" ? profileData.username : null,
      avatarStyle:
        typeof profileData?.avatar_style === "string"
          ? profileData.avatar_style
          : "cyan_user",
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

function nullableNumberField(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
