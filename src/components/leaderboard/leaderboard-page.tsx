"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Medal, ShieldCheck } from "lucide-react";
import { UserRankBadge } from "@/components/gamification/user-rank-badge";
import { AppShell } from "@/components/layout/app-shell";
import { GlassPanel } from "@/components/map/glass-panel";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import {
  type LeaderboardPeriod,
  type LeaderboardRow,
  getLeaderboardPeriodLabel,
  leaderboardTabs,
} from "@/lib/leaderboard/types";
import { cn } from "@/lib/utils";

export function LeaderboardPage() {
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState<LeaderboardPeriod>(
    parsePeriod(searchParams.get("period")),
  );
  const { error, isLoading, rows } = useLeaderboard(period, 25);
  const activeTab = leaderboardTabs.find((tab) => tab.value === period);

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
                    YolDurumu’na yapılan doğrulanabilir katkıların puan
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

          <GlassPanel className="p-2">
            <div
              aria-label="Katkıcı sıralaması dönemi"
              className="grid grid-cols-1 gap-1.5 sm:grid-cols-3"
              role="tablist"
            >
              {leaderboardTabs.map((tab) => {
                const isSelected = period === tab.value;

                return (
                  <button
                    aria-selected={isSelected}
                    className={cn(
                      "min-h-11 rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
                      isSelected
                        ? "border-road-blue bg-white text-ink shadow-sm"
                        : "border-slate-200 bg-white/55 text-ink-muted hover:bg-white",
                    )}
                    key={tab.value}
                    onClick={() => setPeriod(tab.value)}
                    role="tab"
                    type="button"
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </GlassPanel>

          {activeTab ? (
            <p className="px-2 text-sm leading-6 text-ink-muted">
              {activeTab.description} Kullanıcı adları gizlilik için
              kısaltılmıştır.
            </p>
          ) : null}

          {isLoading ? (
            <GlassPanel className="p-4 text-sm text-ink-muted">
              Katkıcı sıralaması yükleniyor...
            </GlassPanel>
          ) : null}

          {error ? (
            <GlassPanel className="border-red-200 bg-red-50/80 p-4 text-sm font-semibold text-red-700">
              {error}
            </GlassPanel>
          ) : null}

          {!isLoading && !error && rows.length === 0 ? (
            <GlassPanel className="p-4">
              <p className="font-semibold text-ink">
                Henüz kesinleşmiş katkı puanı yok.
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                Katkılar doğrulandıkça sıralama oluşacak.
              </p>
            </GlassPanel>
          ) : null}

          {!isLoading && !error && rows.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map((row) => (
                <LeaderboardCard
                  key={`${period}-${row.rank}-${row.user_public_code}`}
                  row={row}
                />
              ))}
            </div>
          ) : null}

          <GlassPanel className="p-4 text-sm leading-6 text-ink-muted">
            Yanlış veya geri çekilen bildirimlerden gelen puanlar geri
            alınabilir. Bu sayfa e-posta adresi veya özel kullanıcı bilgisi
            göstermez.
          </GlassPanel>
        </div>
      </main>
    </AppShell>
  );
}

function LeaderboardCard({ row }: { row: LeaderboardRow }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/62 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/85 text-base font-semibold text-road-blue">
            {row.rank}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-ink">
                {row.public_display_name}
              </h2>
              {row.is_current_user ? (
                <span className="rounded-full border border-road-blue/30 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-road-blue">
                  Sen
                </span>
              ) : null}
            </div>
            <UserRankBadge className="mt-1" compact score={row.points} />
          </div>
        </div>
        <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Etki Puanı" value={row.points} />
        <Metric label="Dönem" value={getLeaderboardPeriodLabel(row.period)} />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/64 px-3 py-2.5">
      <p className="text-lg font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">{label}</p>
    </div>
  );
}

function parsePeriod(value: string | null): LeaderboardPeriod {
  if (value === "week" || value === "month" || value === "all_time") {
    return value;
  }

  return "all_time";
}
