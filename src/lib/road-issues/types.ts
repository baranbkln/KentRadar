import type {
  RoadIssueCategory,
  RoadIssueSeverity,
  RoadIssueStatus,
} from "@/lib/domain/road-issue-options";

export type PublicRoadIssue = {
  id: string;
  latitude: number;
  longitude: number;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  location_label: string | null;
  category: RoadIssueCategory;
  severity: RoadIssueSeverity;
  status: RoadIssueStatus;
  first_reported_at: string;
  last_verified_at: string | null;
  verification_count: number;
  damage_count: number;
  solved_count: number;
  false_report_count: number;
  reporter_count: number;
  severity_score_avg: number;
  created_at: string;
  updated_at: string;
};

export type PublicIssueRankingType =
  | "most_reported"
  | "most_verified"
  | "most_damage"
  | "longest_open"
  | "recently_added"
  | "recently_verified";

export type PublicIssueRankingRow = PublicRoadIssue & {
  open_days: number;
};

export type RoadIssueFilters = {
  categories: RoadIssueCategory[];
  status: RoadIssueStatus | "all";
};

export type SelectedRoadIssueLocation = {
  latitude: number;
  longitude: number;
};

export type CreateIssueOrMergeDuplicateResult = {
  issue_id: string;
  merged: boolean;
  report_accepted: boolean;
  already_reported_by_user: boolean;
  severity_updated: boolean;
  damage_report_added: boolean;
  latitude: number;
  longitude: number;
};

export type IssueActionType =
  | "verify"
  | "damage"
  | "solved"
  | "false_report"
  | "withdraw";

export type IssueActionFeedback = {
  message: string;
  tone: "error" | "success";
};

export type IssueUserState = {
  issue_id: string;
  has_active_report: boolean;
  has_withdrawn_report: boolean;
  has_damage_report: boolean;
  has_verified: boolean;
};

export type ProfileSummary = {
  active_report_count: number;
  withdrawn_report_count: number;
  damage_report_count: number;
  verification_count: number;
  solved_report_count: number;
  false_report_count: number;
};

export type ProfileEntryType =
  | "active_report"
  | "withdrawn_report"
  | "damage"
  | "solved"
  | "false_report"
  | "verified";

export type ProfileEntry = {
  entry_type: ProfileEntryType;
  issue_id: string;
  category: RoadIssueCategory;
  severity: RoadIssueSeverity;
  status: RoadIssueStatus;
  latitude: number;
  longitude: number;
  first_reported_at: string;
  reported_at: string;
  withdrawn_at: string | null;
  reporter_count: number;
  verification_count: number;
  damage_count: number;
  solved_count: number;
  false_report_count: number;
  open_days: number;
  issue_is_public: boolean;
};
