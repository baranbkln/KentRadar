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
  watcher_count: number;
  severity_score_avg: number;
  created_at: string;
  updated_at: string;
};

export type RoadIssueMapCluster = {
  id: string;
  latitude: number;
  longitude: number;
  issueCount: number;
  bounds: {
    minLatitude: number;
    minLongitude: number;
    maxLatitude: number;
    maxLongitude: number;
  };
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

export type DynamicRewardBonus = "CRITICAL_HIT" | "COLD_CASE";

export type IssueActionRpcResult = {
  issue_id: string;
  report_id: string | null;
  status: RoadIssueStatus;
  distance_to_issue_meters: number | null;
  message: string | null;
  final_score: number | null;
  applied_bonus: DynamicRewardBonus | null;
};

export type IssueUserState = {
  issue_id: string;
  has_active_report: boolean;
  has_withdrawn_report: boolean;
  has_damage_report: boolean;
  has_verified: boolean;
  has_solved_report: boolean;
  has_false_report: boolean;
};

export type ProfileSummary = {
  active_report_count: number;
  withdrawn_report_count: number;
  damage_report_count: number;
  verification_count: number;
  solved_report_count: number;
  false_report_count: number;
};

export type CivicDashboard = ProfileSummary & {
  watched_issue_count: number;
  received_verification_count: number;
  received_damage_count: number;
  received_solved_count: number;
  received_false_report_count: number;
  received_watcher_count: number;
  active_reporter_count_on_my_issues: number;
  avg_open_days_on_my_active_issues: number;
  highest_interaction_issue_id: string | null;
  highest_interaction_score: number;
  highest_interaction_label: string | null;
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

export type IssueWatchState = {
  issue_id: string;
  is_watching: boolean;
  notification_enabled: boolean;
  watcher_count: number;
};

export type ProfileWatchedIssue = {
  issue_id: string;
  category: RoadIssueCategory;
  severity: RoadIssueSeverity;
  status: RoadIssueStatus;
  latitude: number;
  longitude: number;
  first_reported_at: string;
  last_verified_at: string | null;
  reporter_count: number;
  verification_count: number;
  damage_count: number;
  solved_count: number;
  false_report_count: number;
  watcher_count: number;
  open_days: number;
  watched_at: string;
  issue_is_public: boolean;
};
