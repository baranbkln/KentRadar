import type {
  PublicIssueRankingRow,
  PublicRoadIssue,
} from "@/lib/road-issues/types";

export type IssueIntensityLevel =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "stale";

export type IssueIntensity = {
  level: IssueIntensityLevel;
  label: string;
  score: number;
};

type IntensityIssue = Pick<
  PublicRoadIssue,
  | "created_at"
  | "damage_count"
  | "false_report_count"
  | "first_reported_at"
  | "last_verified_at"
  | "reporter_count"
  | "severity"
  | "solved_count"
  | "status"
  | "updated_at"
  | "verification_count"
> &
  Partial<Pick<PublicIssueRankingRow, "open_days">>;

export function calculateIssueIntensity(issue: IntensityIssue): IssueIntensity {
  const openDays = getIssueOpenDays(issue);
  const daysSinceVerification = getDaysSince(issue.last_verified_at);

  if (
    issue.status === "stale" ||
    issue.status === "disputed" ||
    issue.status === "likely_solved" ||
    issue.status === "solved" ||
    shouldTreatAsStale(issue, openDays, daysSinceVerification)
  ) {
    return {
      label: getIssueIntensityLabel("stale"),
      level: "stale",
      score: calculateIssueScore(issue, openDays),
    };
  }

  const score = calculateIssueScore(issue, openDays);

  if (score >= 16) {
    return {
      label: getIssueIntensityLabel("critical"),
      level: "critical",
      score,
    };
  }

  if (score >= 9) {
    return {
      label: getIssueIntensityLabel("high"),
      level: "high",
      score,
    };
  }

  if (score >= 4) {
    return {
      label: getIssueIntensityLabel("medium"),
      level: "medium",
      score,
    };
  }

  return {
    label: getIssueIntensityLabel("low"),
    level: "low",
    score,
  };
}

export function getIssueIntensityLabel(level: IssueIntensityLevel) {
  switch (level) {
    case "critical":
      return "Kritik yoğunluk";
    case "high":
      return "Yüksek yoğunluk";
    case "medium":
      return "Orta yoğunluk";
    case "stale":
      return "Güncelliği belirsiz";
    case "low":
      return "Düşük yoğunluk";
  }
}

export function getIssueIntensityDescription(issue: IntensityIssue) {
  const intensity = calculateIssueIntensity(issue);

  if (intensity.level === "stale") {
    return "Bu yol sorununun güncelliği yeniden doğrulanmalı.";
  }

  if (issue.damage_count > 0 && intensity.level !== "low") {
    return "Bu yol sorunu hasar bildirimleri nedeniyle daha yüksek yoğunlukta görünüyor.";
  }

  if (issue.verification_count >= 2) {
    return "Bu yol sorunu birden fazla kullanıcı tarafından doğrulanmış.";
  }

  if (issue.reporter_count >= 2) {
    return "Bu yol sorunu birden fazla kullanıcı tarafından bildirilmiş.";
  }

  return "Bu yol sorunu düşük yoğunluklu bildirimlerle açık görünüyor.";
}

export function getIssueIntensityClassName(level: IssueIntensityLevel) {
  switch (level) {
    case "critical":
      return "border-red-300 bg-red-100 text-red-900";
    case "high":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "stale":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "low":
      return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }
}

export function getIssueMarkerStyle(level: IssueIntensityLevel) {
  switch (level) {
    case "critical":
      return {
        color: "#991B1B",
        opacity: 1,
        ring: "0 0 0 4px rgba(153, 27, 27, 0.22), 0 12px 28px rgba(153, 27, 27, 0.34)",
      };
    case "high":
      return {
        color: "#DC2626",
        opacity: 1,
        ring: "0 0 0 3px rgba(220, 38, 38, 0.18), 0 10px 24px rgba(220, 38, 38, 0.28)",
      };
    case "medium":
      return {
        color: "#EA580C",
        opacity: 1,
        ring: "0 10px 24px rgba(234, 88, 12, 0.26)",
      };
    case "stale":
      return {
        color: "#64748B",
        opacity: 0.72,
        ring: "0 8px 18px rgba(71, 85, 105, 0.18)",
      };
    case "low":
      return {
        color: "#CA8A04",
        opacity: 1,
        ring: "0 8px 20px rgba(202, 138, 4, 0.2)",
      };
  }
}

export function calculateOpenDays(firstReportedAt: string) {
  const startedAt = new Date(firstReportedAt).getTime();

  if (Number.isNaN(startedAt)) {
    return 0;
  }

  return Math.max(Math.floor((Date.now() - startedAt) / 86_400_000), 0);
}

function calculateIssueScore(issue: IntensityIssue, openDays: number) {
  return (
    Math.min(issue.reporter_count, 10) +
    Math.min(issue.verification_count * 2, 16) +
    Math.min(issue.damage_count * 4, 20) +
    getSeverityScore(issue.severity) +
    getOpenDaysScore(openDays)
  );
}

function shouldTreatAsStale(
  issue: IntensityIssue,
  openDays: number,
  daysSinceVerification: number | null,
) {
  const hasStrongRecentSignal =
    issue.reporter_count >= 3 || issue.damage_count > 0 || issue.verification_count > 0;

  if (issue.verification_count === 0 && openDays >= 30 && !hasStrongRecentSignal) {
    return true;
  }

  return daysSinceVerification !== null && daysSinceVerification > 60 && openDays >= 90;
}

function getSeverityScore(severity: PublicRoadIssue["severity"]) {
  if (severity === "high") {
    return 4;
  }

  if (severity === "medium") {
    return 2;
  }

  return 0;
}

function getOpenDaysScore(openDays: number) {
  if (openDays >= 90) {
    return 3;
  }

  if (openDays >= 30) {
    return 2;
  }

  if (openDays >= 7) {
    return 1;
  }

  return 0;
}

function getIssueOpenDays(issue: IntensityIssue) {
  return issue.open_days ?? calculateOpenDays(issue.first_reported_at);
}

function getDaysSince(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.floor((Date.now() - timestamp) / 86_400_000);
}
