"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Medal } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LeaderboardPanel } from "@/components/leaderboard/leaderboard-panel";
import { GlassPanel } from "@/components/map/glass-panel";
import type { LeaderboardPeriod } from "@/lib/leaderboard/types";

export function LeaderboardPage() {
  const searchParams = useSearchParams();
  const initialPeriod = parsePeriod(searchParams.get("period"));

  return (
    <AppShell>
      <main className="min-h-dvh bg-surface px-3 py-4 text-ink md:px-6 md:py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <GlassPanel className="p-4 md:p-5">
            <Link
              className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              href="/"
            >
              <ArrowLeft className="size-4" />
              Haritaya dön
            </Link>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/72 text-road-blue">
                  <Medal className="size-5" />
                </span>
                <div>
                  <h1 className="text-2xl font-semibold tracking-normal text-ink">
                    Katkıcı Sıralaması
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                    KentRadar’a yapılan doğrulanabilir katkıların puan
                    tablosu.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/58 px-3 py-2 text-xs font-semibold leading-5 text-ink-muted md:max-w-sm">
                Sıralama yalnızca kesinleşmiş Etki Puanı üzerinden hesaplanır.
                Bekleyen puanlar dahil edilmez.
              </div>
            </div>
          </GlassPanel>

          <LeaderboardPanel initialPeriod={initialPeriod} />
        </div>
      </main>
    </AppShell>
  );
}

function parsePeriod(value: string | null): LeaderboardPeriod {
  if (value === "week" || value === "month" || value === "all_time") {
    return value;
  }

  return "all_time";
}
