import type { Metadata } from "next";
import {
  PublicIssueDetailPage,
  PublicIssueNotFound,
} from "@/components/issues/public-issue-detail-page";
import { categoryLabels } from "@/lib/domain/road-issue-options";
import { getPublicIssueDetail } from "@/lib/issues/public-issue-detail";
import {
  getIssuePublicUrl,
  getIssueShareDescription,
} from "@/lib/issues/issue-share";

type IssuePageProps = {
  params: Promise<{
    issueId: string;
  }>;
};

export async function generateMetadata({
  params,
}: IssuePageProps): Promise<Metadata> {
  const { issueId } = await params;
  const issue = await getPublicIssueDetail(issueId);

  if (!issue) {
    return {
      title: "Yol sorunu bulunamadı | YolDurumu",
      description:
        "Bu yol sorunu bulunamadı veya artık aktif haritada görünmüyor.",
    };
  }

  const title = `${categoryLabels[issue.category]} · ${issue.open_days} gündür açık görünüyor | YolDurumu`;
  const description = getIssueShareDescription(issue);
  const url = getIssuePublicUrl(issue.id);

  return {
    title,
    description,
    openGraph: {
      description,
      title,
      type: "article",
      url,
    },
    twitter: {
      card: "summary",
      description,
      title,
    },
  };
}

export default async function IssueDetailRoute({ params }: IssuePageProps) {
  const { issueId } = await params;
  const issue = await getPublicIssueDetail(issueId);

  if (!issue) {
    return <PublicIssueNotFound />;
  }

  return <PublicIssueDetailPage issue={issue} />;
}
