export type LeaderboardPeriod = "week" | "month" | "all_time";

export type LeaderboardRow = {
  rank: number;
  public_display_name: string;
  level_label: string;
  points: number;
  period: LeaderboardPeriod;
  is_current_user: boolean;
  user_public_code: string | null;
  username: string | null;
  avatar_style: string;
};

export type LocalContributorRow = LeaderboardRow & {
  city: string;
  district: string | null;
};

export type RegionalLeaderboardRow = {
  rank: number;
  city: string;
  district: string;
  total_resolved: number;
  total_reports: number;
  total_verified: number;
  total_issues: number;
};

export type IssueRegionOption = {
  city: string;
  district: string | null;
};

export const leaderboardTabs: {
  label: string;
  description: string;
  value: LeaderboardPeriod;
}[] = [
  {
    label: "Bu hafta",
    description: "Bu hafta kesinleşen Etki Puanı katkıları.",
    value: "week",
  },
  {
    label: "Bu ay",
    description: "Bu ay kesinleşen Etki Puanı katkıları.",
    value: "month",
  },
  {
    label: "Tüm zamanlar",
    description: "Toplam kesinleşmiş Etki Puanı.",
    value: "all_time",
  },
];

export function getLeaderboardPeriodLabel(period: LeaderboardPeriod) {
  return leaderboardTabs.find((tab) => tab.value === period)?.label ?? "Tüm zamanlar";
}
