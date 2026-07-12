import type { Metadata } from "next";
import { FixedIssuesPage } from "@/components/fixed/fixed-issues-page";

export const metadata: Metadata = {
  title: "Son Çözülenler | YolDurumu",
  description:
    "Kullanıcı bildirimleriyle çözüldü olarak işaretlenen yol sorunlarını inceleyin.",
};

export default function Page() {
  return <FixedIssuesPage />;
}
