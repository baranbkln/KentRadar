export type ScoreEventStatus = "pending" | "confirmed" | "reversed" | "ignored";

export type ScoreEventType =
  | "issue_report_created"
  | "issue_report_verified_bonus"
  | "issue_damage_received_bonus"
  | "issue_solved_bonus"
  | "issue_verified_by_user"
  | "damage_reported_by_user"
  | "issue_solved_reported_by_user"
  | "issue_false_reported_by_user";

export type CivicScoreSummary = {
  confirmed_points: number;
  pending_points: number;
  reversed_points: number;
  ignored_points: number;
  level_label: string;
  updated_at: string | null;
};

export type CivicScoreEvent = {
  event_type: ScoreEventType | string;
  points: number;
  status: ScoreEventStatus;
  reason: string | null;
  issue_id: string | null;
  created_at: string;
  finalized_at: string | null;
  reversed_at: string | null;
};

export function formatScoreEventLabel(eventType: string) {
  const labels: Record<ScoreEventType, string> = {
    damage_reported_by_user: "Hasar bildirimi",
    issue_damage_received_bonus: "Bildirimin hasar bildirimi aldı",
    issue_false_reported_by_user: "Yanlış/burada değil bildirimi",
    issue_report_created: "Sorun bildirimi",
    issue_report_verified_bonus: "Bildirimin doğrulandı",
    issue_solved_bonus: "Bildirimin çözüldü",
    issue_solved_reported_by_user: "Çözüldü bildirimi",
    issue_verified_by_user: "Sorun doğruladın",
  };

  return labels[eventType as ScoreEventType] ?? "Katkı olayı";
}

export function formatScoreStatusLabel(status: ScoreEventStatus | string) {
  switch (status) {
    case "pending":
      return "Bekliyor";
    case "confirmed":
      return "Kesinleşti";
    case "reversed":
      return "Geri alındı";
    case "ignored":
      return "Yok sayıldı";
    default:
      return "Bilinmiyor";
  }
}
