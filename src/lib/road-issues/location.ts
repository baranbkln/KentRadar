import type { PublicRoadIssue } from "@/lib/road-issues/types";

type IssueLocation = Pick<
  PublicRoadIssue,
  | "city"
  | "district"
  | "latitude"
  | "location_label"
  | "longitude"
  | "neighborhood"
>;

export function formatIssueLocation(issue: IssueLocation) {
  if (issue.city && issue.district && issue.neighborhood) {
    return `${issue.city} / ${issue.district} · ${issue.neighborhood}`;
  }

  if (issue.city && issue.district) {
    return `${issue.city} / ${issue.district}`;
  }

  if (issue.location_label) {
    return issue.location_label;
  }

  if (Number.isFinite(issue.latitude) && Number.isFinite(issue.longitude)) {
    return `${issue.latitude.toFixed(2)}, ${issue.longitude.toFixed(2)}`;
  }

  return "Konum bilgisi yok";
}

export function hasStructuredIssueLocation(issue: IssueLocation) {
  return Boolean(issue.city || issue.district || issue.neighborhood);
}
