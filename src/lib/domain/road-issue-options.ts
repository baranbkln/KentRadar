export const roadIssueCategories = [
  "pothole",
  "collapsed_road",
  "broken_asphalt",
  "manhole_cover",
  "water_accumulation",
  "other",
] as const;

export type RoadIssueCategory = (typeof roadIssueCategories)[number];

export const roadIssueSeverities = ["low", "medium", "high"] as const;

export type RoadIssueSeverity = (typeof roadIssueSeverities)[number];

export const roadIssueStatuses = [
  "new",
  "verified",
  "active",
  "stale",
  "likely_solved",
  "solved",
  "disputed",
] as const;

export type RoadIssueStatus = (typeof roadIssueStatuses)[number];

export const categoryLabels: Record<RoadIssueCategory, string> = {
  pothole: "Çukur",
  collapsed_road: "Çökmüş Yol",
  broken_asphalt: "Bozuk Asfalt",
  manhole_cover: "Rögar / Kapak Sorunu",
  water_accumulation: "Su Birikintisi",
  other: "Diğer",
};

export const severityLabels: Record<RoadIssueSeverity, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
};

export const statusLabels: Record<RoadIssueStatus, string> = {
  new: "Yeni",
  verified: "Doğrulandı",
  active: "Aktif",
  stale: "Güncelliği Belirsiz",
  likely_solved: "Çözülmüş olabilir",
  solved: "Çözüldü",
  disputed: "Tartışmalı",
};

export const categoryOptions = roadIssueCategories.map((value) => ({
  value,
  label: categoryLabels[value],
}));

export const severityOptions = roadIssueSeverities.map((value) => ({
  value,
  label: severityLabels[value],
}));

export const statusOptions = roadIssueStatuses.map((value) => ({
  value,
  label: statusLabels[value],
}));
