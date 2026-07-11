import { createClient } from "@/lib/supabase/server";
import { calculateOpenDays } from "@/lib/issues/issue-intensity";
import type { PublicIssueRankingRow } from "@/lib/road-issues/types";

const ISSUE_COLUMNS =
  "id, latitude, longitude, city, district, neighborhood, location_label, category, severity, status, first_reported_at, last_verified_at, verification_count, damage_count, solved_count, false_report_count, reporter_count, severity_score_avg, created_at, updated_at";
const FALLBACK_ISSUE_COLUMNS =
  "id, latitude, longitude, category, severity, status, first_reported_at, last_verified_at, verification_count, damage_count, solved_count, false_report_count, reporter_count, severity_score_avg, created_at, updated_at";

export async function getPublicIssueDetail(issueId: string) {
  try {
    const supabase = await createClient();
    const result = await supabase
      .from("road_issue_public_stats")
      .select(ISSUE_COLUMNS)
      .eq("id", issueId)
      .maybeSingle();
    let row = result.data as Record<string, unknown> | null;
    let queryError = result.error;

    if (queryError && isMissingLocationColumnError(queryError.message)) {
      const fallbackResult = await supabase
        .from("road_issue_public_stats")
        .select(FALLBACK_ISSUE_COLUMNS)
        .eq("id", issueId)
        .maybeSingle();

      row = fallbackResult.data as Record<string, unknown> | null;
      queryError = fallbackResult.error;
    }

    if (queryError || !row) {
      if (queryError && process.env.NODE_ENV === "development") {
        console.error("public issue detail query error", queryError);
      }

      return null;
    }

    return toPublicIssueDetail(row);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("public issue detail load error", error);
    }

    return null;
  }
}

function toPublicIssueDetail(row: Record<string, unknown>): PublicIssueRankingRow {
  const firstReportedAt = stringField(row.first_reported_at);

  return {
    category: row.category as PublicIssueRankingRow["category"],
    city: nullableStringField(row.city),
    created_at: stringField(row.created_at),
    damage_count: numberField(row.damage_count),
    district: nullableStringField(row.district),
    false_report_count: numberField(row.false_report_count),
    first_reported_at: firstReportedAt,
    id: stringField(row.id),
    last_verified_at: nullableStringField(row.last_verified_at),
    latitude: numberField(row.latitude),
    location_label: nullableStringField(row.location_label),
    longitude: numberField(row.longitude),
    neighborhood: nullableStringField(row.neighborhood),
    open_days: calculateOpenDays(firstReportedAt),
    reporter_count: numberField(row.reporter_count),
    severity: row.severity as PublicIssueRankingRow["severity"],
    severity_score_avg: numberField(row.severity_score_avg),
    solved_count: numberField(row.solved_count),
    status: row.status as PublicIssueRankingRow["status"],
    updated_at: stringField(row.updated_at),
    verification_count: numberField(row.verification_count),
  };
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableStringField(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isMissingLocationColumnError(message: string) {
  return (
    message.includes("city") ||
    message.includes("district") ||
    message.includes("neighborhood") ||
    message.includes("location_label")
  );
}
