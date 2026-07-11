import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardPage } from "@/components/leaderboard/leaderboard-page";

export const metadata: Metadata = {
  title: "Katkıcı Sıralaması | YolDurumu",
  description:
    "YolDurumu'na yapılan doğrulanabilir katkıların Etki Puanı sıralaması.",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LeaderboardPage />
    </Suspense>
  );
}
