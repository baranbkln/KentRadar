import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardPage } from "@/components/leaderboard/leaderboard-page";

export const metadata: Metadata = {
  title: "Katkıcı Sıralaması",
  description:
    "KentRadar'a yapılan doğrulanabilir katkıların Etki Puanı sıralaması.",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LeaderboardPage />
    </Suspense>
  );
}
