"use client";

import { useCallback, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CivicDashboard } from "@/lib/road-issues/types";

export const emptyCivicDashboard: CivicDashboard = {
  active_report_count: 0,
  active_reporter_count_on_my_issues: 0,
  avg_open_days_on_my_active_issues: 0,
  damage_report_count: 0,
  false_report_count: 0,
  highest_interaction_issue_id: null,
  highest_interaction_label: null,
  highest_interaction_score: 0,
  received_damage_count: 0,
  received_false_report_count: 0,
  received_solved_count: 0,
  received_verification_count: 0,
  received_watcher_count: 0,
  solved_report_count: 0,
  verification_count: 0,
  watched_issue_count: 0,
  withdrawn_report_count: 0,
};

export function useCivicDashboard(supabase: SupabaseClient | null) {
  const [dashboard, setDashboard] =
    useState<CivicDashboard>(emptyCivicDashboard);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!supabase) {
      setDashboard(emptyCivicDashboard);
      return emptyCivicDashboard;
    }

    setIsLoadingDashboard(true);
    setDashboardError(null);

    const { data, error } = await supabase.rpc("get_my_civic_dashboard");

    setIsLoadingDashboard(false);

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("get_my_civic_dashboard RPC error", error);
      }

      setDashboard(emptyCivicDashboard);
      setDashboardError("Kişisel etki karnesi yüklenemedi.");
      return emptyCivicDashboard;
    }

    const nextDashboard = parseCivicDashboard(data);
    setDashboard(nextDashboard);

    return nextDashboard;
  }, [supabase]);

  const resetDashboard = useCallback(() => {
    setDashboard(emptyCivicDashboard);
    setDashboardError(null);
    setIsLoadingDashboard(false);
  }, []);

  return {
    dashboard,
    dashboardError,
    isLoadingDashboard,
    loadDashboard,
    resetDashboard,
  };
}

function parseCivicDashboard(value: unknown): CivicDashboard {
  const result = Array.isArray(value) ? value[0] : value;

  if (!result || typeof result !== "object") {
    return emptyCivicDashboard;
  }

  const record = result as Record<string, unknown>;

  return {
    active_report_count: numberField(record.active_report_count),
    active_reporter_count_on_my_issues: numberField(
      record.active_reporter_count_on_my_issues,
    ),
    avg_open_days_on_my_active_issues: numberField(
      record.avg_open_days_on_my_active_issues,
    ),
    damage_report_count: numberField(record.damage_report_count),
    false_report_count: numberField(record.false_report_count),
    highest_interaction_issue_id:
      typeof record.highest_interaction_issue_id === "string"
        ? record.highest_interaction_issue_id
        : null,
    highest_interaction_label:
      typeof record.highest_interaction_label === "string"
        ? record.highest_interaction_label
        : null,
    highest_interaction_score: numberField(record.highest_interaction_score),
    received_damage_count: numberField(record.received_damage_count),
    received_false_report_count: numberField(record.received_false_report_count),
    received_solved_count: numberField(record.received_solved_count),
    received_verification_count: numberField(
      record.received_verification_count,
    ),
    received_watcher_count: numberField(record.received_watcher_count),
    solved_report_count: numberField(record.solved_report_count),
    verification_count: numberField(record.verification_count),
    watched_issue_count: numberField(record.watched_issue_count),
    withdrawn_report_count: numberField(record.withdrawn_report_count),
  };
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
