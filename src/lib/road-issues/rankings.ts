import type { PublicIssueRankingType } from "@/lib/road-issues/types";

export type RankingTabConfig = {
  description: string;
  fullLabel: string;
  label: string;
  value: PublicIssueRankingType;
};

export const issueRankingTabs: RankingTabConfig[] = [
  {
    description: "En fazla kullanıcı bildirimi olan açık kayıtlar.",
    fullLabel: "En çok bildirilen",
    label: "En çok bildirilen",
    value: "most_reported",
  },
  {
    description: "Yerinde doğrulama sayısı yüksek kayıtlar.",
    fullLabel: "En çok doğrulanan",
    label: "En çok doğrulanan",
    value: "most_verified",
  },
  {
    description: "Araç hasarı bildirimi bulunan kayıtlar.",
    fullLabel: "En çok hasar bildirilen",
    label: "En çok hasar",
    value: "most_damage",
  },
  {
    description: "İlk bildirimi en eski olan kayıtlar.",
    fullLabel: "En uzun süredir açık",
    label: "En uzun açık",
    value: "longest_open",
  },
  {
    description: "Haritaya en son eklenen kayıtlar.",
    fullLabel: "Son eklenen",
    label: "Son eklenen",
    value: "recently_added",
  },
  {
    description: "Yakın zamanda doğrulanan kayıtlar.",
    fullLabel: "Son doğrulanan",
    label: "Son doğrulanan",
    value: "recently_verified",
  },
];

export function getIssueRankingTab(value: PublicIssueRankingType) {
  return issueRankingTabs.find((tab) => tab.value === value);
}
