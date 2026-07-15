"use client";

import { ArrowLeft, Check, ExternalLink, Trophy, X } from "lucide-react";
import Link from "next/link";
import { UserRankBadge } from "@/components/gamification/user-rank-badge";
import { GlassPanel } from "@/components/map/glass-panel";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import {
  type LeaderboardPeriod,
  type LeaderboardRow,
  leaderboardTabs,
} from "@/lib/leaderboard/types";
import { cn } from "@/lib/utils";

type LeaderboardPreviewProps = {
  period: LeaderboardPeriod;
  onClose: () => void;
  onPeriodChange: (period: LeaderboardPeriod) => void;
};

export function LeaderboardPreview({
  period,
  onClose,
  onPeriodChange,
}: LeaderboardPreviewProps) {
  const { error, isLoading, rows } = useLeaderboard(period, 5);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[716] p-3 pb-[max(12px,env(safe-area-inset-bottom))] md:bottom-5 md:left-auto md:right-5 md:top-28 md:w-[370px] md:p-0">
      <GlassPanel className="pointer-events-auto flex h-full flex-col overflow-hidden p-3 md:p-3.5">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <button
              aria-label="Haritaya geri dön"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/72 text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              onClick={onClose}
              type="button"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">
                Katkıcı Sıralaması
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Kesinleşmiş Etki Puanı’na göre.
              </p>
            </div>
          </div>
          <button
            aria-label="Katkıcı sıralamasını kapat"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/72 text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
        </div>

        <div
          aria-label="Katkıcı sıralaması dönemi"
          className="mb-2.5 grid grid-cols-3 gap-1.5"
          role="tablist"
        >
          {leaderboardTabs.map((tab) => {
            const isSelected = tab.value === period;

            return (
              <button
                aria-selected={isSelected}
                className={cn(
                  "flex min-h-10 items-center justify-center gap-1 rounded-full border px-2 py-1 text-center text-[10px] font-semibold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
                  isSelected
                    ? "border-road-blue bg-white text-ink shadow-sm"
                    : "border-slate-200 bg-white/55 text-ink-muted hover:bg-white",
                )}
                key={tab.value}
                onClick={() => onPeriodChange(tab.value)}
                role="tab"
                type="button"
              >
                <span className="min-w-0 break-words">{tab.label}</span>
                {isSelected ? (
                  <Check
                    aria-hidden="true"
                    className="size-3 shrink-0 text-road-blue"
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {isLoading ? (
            <p className="rounded-2xl border border-slate-200 bg-white/62 px-3 py-3 text-sm text-ink-muted">
              Katkıcı sıralaması yükleniyor...
            </p>
          ) : null}

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50/80 px-3 py-3 text-sm font-semibold text-red-700">
              Katkıcı sıralaması yüklenirken bir hata oluştu.
            </p>
          ) : null}

          {!isLoading && !error && rows.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white/62 px-3 py-3 text-sm text-ink-muted">
              Henüz kesinleşmiş katkı puanı yok.
            </p>
          ) : null}

          {!isLoading && !error
            ? rows.map((row, index) => (
                <LeaderboardPreviewItem
                  index={index}
                  key={`${period}-${row.rank}-${row.user_public_code}`}
                  row={row}
                />
              ))
            : null}
        </div>

        <Link
          className="mt-2.5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
          href={`/leaderboard?period=${period}`}
        >
          Tümünü gör
          <ExternalLink className="size-4" />
        </Link>
      </GlassPanel>
    </div>
  );
}

function LeaderboardPreviewItem({
  index,
  row,
}: {
  index: number;
  row: LeaderboardRow;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border border-slate-200 bg-white/62 p-2.5",
        index >= 3 ? "hidden sm:block" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-xs font-semibold text-road-blue">
            {row.rank}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-ink">
                {row.public_display_name}
              </p>
              {row.is_current_user ? (
                <span className="rounded-full border border-road-blue/30 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-road-blue">
                  Sen
                </span>
              ) : null}
            </div>
            <UserRankBadge
              className="mt-0.5"
              compact
              score={row.points}
              showInfo={false}
            />
          </div>
        </div>
        <Trophy className="size-4 shrink-0 text-amber-600" />
      </div>
      <p className="mt-2 text-xs font-semibold text-ink-subtle">
        {row.points} kesinleşmiş puan
      </p>
    </article>
  );
}
