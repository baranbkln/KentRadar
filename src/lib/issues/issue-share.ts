import { categoryLabels } from "@/lib/domain/road-issue-options";
import { calculateOpenDays } from "@/lib/issues/issue-intensity";
import type { PublicIssueRankingRow, PublicRoadIssue } from "@/lib/road-issues/types";

type ShareIssue = Pick<
  PublicRoadIssue,
  | "category"
  | "damage_count"
  | "first_reported_at"
  | "id"
  | "reporter_count"
  | "verification_count"
> &
  Partial<Pick<PublicIssueRankingRow, "open_days">>;

export function getIssuePublicUrl(issueId: string, baseUrl?: string | null) {
  const normalizedBaseUrl = normalizeBaseUrl(
    baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL,
  );

  if (!normalizedBaseUrl) {
    return `/i/${issueId}`;
  }

  return `${normalizedBaseUrl}/i/${issueId}`;
}

export function getIssueShareText(issue: ShareIssue) {
  const openDays = issue.open_days ?? calculateOpenDays(issue.first_reported_at);

  return `YolDurumu'nda bildirilen bir yol sorunu: ${categoryLabels[issue.category]} · ${openDays} gündür açık görünüyor · ${issue.reporter_count} kullanıcı bildirdi.`;
}

export function getIssueShareDescription(issue: ShareIssue) {
  return `Bu yol sorunu ${issue.reporter_count} kullanıcı tarafından bildirildi, ${issue.verification_count} kez doğrulandı ve ${issue.damage_count} hasar bildirimi aldı.`;
}

export function getWhatsAppShareUrl(issue: ShareIssue, baseUrl?: string | null) {
  const text = `${getIssueShareText(issue)} ${getIssuePublicUrl(issue.id, baseUrl)}`;

  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function getTwitterShareUrl(issue: ShareIssue, baseUrl?: string | null) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    getIssueShareText(issue),
  )}&url=${encodeURIComponent(getIssuePublicUrl(issue.id, baseUrl))}`;
}

function normalizeBaseUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}
