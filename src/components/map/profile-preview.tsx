"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, LogOut, X } from "lucide-react";
import { GlassPanel } from "@/components/map/glass-panel";
import { PlayerAvatar } from "@/components/profile/player-avatar";
import type { AccountSummary } from "@/hooks/use-account-summary";

type ProfilePreviewProps = {
  accountSummary: AccountSummary;
  error: string | null;
  isLoading: boolean;
  userEmail: string | null;
  onClose: () => void;
  onSignOut: () => void;
};

export function ProfilePreview({
  accountSummary,
  error,
  isLoading,
  userEmail,
  onClose,
  onSignOut,
}: ProfilePreviewProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[735] p-3 pb-[max(12px,env(safe-area-inset-bottom))] md:bottom-auto md:left-auto md:right-5 md:top-28 md:w-[360px] md:p-0">
      <GlassPanel className="pointer-events-auto p-3.5 md:p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
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
              <div className="mb-2 flex items-center gap-2">
                <PlayerAvatar
                  avatarStyle={accountSummary.avatarStyle}
                  className="size-9 rounded-xl"
                  iconClassName="size-4"
                  label={`${accountSummary.username ?? "Oyuncu"} avatarı`}
                />
                <p className="truncate text-sm font-semibold text-ink">
                  {accountSummary.username ?? "Oyuncu profili"}
                </p>
              </div>
              <h2 className="text-base font-semibold text-ink">Profilim</h2>
              <p className="mt-1 truncate text-sm text-ink-muted">
                {userEmail ?? "Hesap bilgileri"}
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold text-ink">
                {accountSummary.levelLabel} · {accountSummary.confirmedPoints} puan
              </p>
            </div>
          </div>
          <button
            aria-label="Profil özetini kapat"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/72 text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
        </div>

        {isLoading ? (
          <p className="rounded-2xl border border-slate-200 bg-white/62 px-3 py-3 text-sm text-ink-muted">
            Etki bilgileri yükleniyor...
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50/80 px-3 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        {!isLoading && !error ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white/62 p-3">
              <p className="text-xs font-semibold uppercase text-ink-subtle">
                Etki Puanı
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <SummaryMetric
                  label="Kesinleşmiş"
                  value={accountSummary.confirmedPoints}
                />
                <SummaryMetric
                  label="Bekleyen"
                  value={accountSummary.pendingPoints}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-ink-muted">
                Seviye: {accountSummary.levelLabel}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <SummaryMetric
                label="Aktif bildirim"
                value={accountSummary.activeReportCount}
              />
              <SummaryMetric
                label="Takip"
                value={accountSummary.watchedIssueCount}
              />
              <SummaryMetric
                label="Hasar bildirimi"
                value={accountSummary.damageReportCount}
              />
              <SummaryMetric
                label="Doğrulama"
                value={accountSummary.verificationCount}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue sm:col-span-2"
            href="/profile"
          >
            Profilime git
            <ExternalLink className="size-4" />
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
            href="/leaderboard"
          >
            Sıralama
          </Link>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
            onClick={onSignOut}
            type="button"
          >
            <LogOut className="size-4" />
            Çıkış
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/62 px-3 py-2.5">
      <p className="text-lg font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">{label}</p>
    </div>
  );
}
