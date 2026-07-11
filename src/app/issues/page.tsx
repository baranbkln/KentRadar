import { Suspense } from "react";
import { IssuesPage } from "@/components/issues/issues-page";

export default function PublicIssuesPage() {
  return (
    <Suspense fallback={null}>
      <IssuesPage />
    </Suspense>
  );
}
