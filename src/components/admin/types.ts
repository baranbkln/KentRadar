import type {
  RoadIssueCategory,
  RoadIssueSeverity,
  RoadIssueStatus,
} from "@/lib/domain/road-issue-options";

export type AdminIssueAction = "hide" | "resolve" | "reject";

export type AdminProfileSummary = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export type ModerationIssue = {
  id: string;
  category: RoadIssueCategory;
  severity: RoadIssueSeverity;
  status: RoadIssueStatus;
  created_by: string;
  reporter_count: number;
  verification_count: number;
  damage_count: number;
  created_at: string;
  is_hidden: boolean;
  reporter: AdminProfileSummary | null;
};

export type AdminUser = AdminProfileSummary & {
  is_admin: boolean;
  is_suspended: boolean;
  created_at: string;
  confirmed_points: number | null;
};

export type AdminAuditLog = {
  id: string;
  admin_id: string;
  action_type: string;
  target_id: string;
  reason: string;
  created_at: string;
  admin: AdminProfileSummary | null;
};
