"use client";

import { ArrowLeft, Check, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { GlassPanel } from "@/components/map/glass-panel";
import { usePublicIssueRankings } from "@/hooks/use-public-issue-rankings";
import {
  categoryLabels,
  severityLabels,
  statusLabels,
} from "@/lib/domain/road-issue-options";
import {
  calculateIssueIntensity,
  getIssueIntensityClassName,
  type IssueIntensityLevel,
} from "@/lib/issues/issue-intensity";
import { issueRankingTabs } from "@/lib/road-issues/rankings";
import type {
  PublicIssueRankingRow,
  PublicIssueRankingType,
} from "@/lib/road-issues/types";
import { cn } from "@/lib/utils";

type IssueRankingPreviewProps = {
  rankingType: PublicIssueRankingType;
  onClose: () => void;
  onIssueSelect: (issueId: string) => void;
  onRankingTypeChange: (rankingType: PublicIssueRankingType) => void;
};

export function IssueRankingPreview({
  rankingType,
  onClose,
  onIssueSelect,
  onRankingTypeChange,
}: IssueRankingPreviewProps) {
  const { error, isLoading, rankings } = usePublicIssueRankings(rankingType);
  const previewIssues = rankings.slice(0, 5);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[715] p-3 pb-[max(12px,env(safe-area-inset-bottom))] md:bottom-auto md:left-auto md:right-5 md:top-28 md:w-[390px] md:p-0">
      <GlassPanel className="pointer-events-auto max-h-[58dvh] overflow-hidden p-3.5 md:max-h-[calc(100dvh-8rem)] md:p-4">
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
              <h2 className="text-base font-semibold text-ink">Sorun Listesi</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Öne çıkan yol sorunları
              </p>
            </div>
          </div>
          <button
            aria-label="Sorun listesini kapat"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/72 text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
        </div>

        <div
          aria-label="Öne çıkan yol sorunu sıralaması"
          className="mb-3 grid grid-cols-2 gap-1.5"
          role="tablist"
        >
          {issueRankingTabs.map((tab) => {
            const isSelected = tab.value === rankingType;

            return (
              <button
                aria-selected={isSelected}
                className={cn(
                  "flex min-h-[42px] items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-left text-[11px] font-semibold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
                  isSelected
                    ? "border-road-blue bg-white text-ink shadow-sm"
                    : "border-slate-200 bg-white/55 text-ink-muted hover:bg-white",
                )}
                key={tab.value}
                onClick={() => onRankingTypeChange(tab.value)}
                role="tab"
                type="button"
              >
                <span className="min-w-0 break-words">{tab.label}</span>
                {isSelected ? (
                  <Check
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-road-blue"
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="max-h-[30dvh] space-y-2 overflow-y-auto pr-1 md:max-h-[48dvh]">
          {isLoading ? (
            <p className="rounded-2xl border border-slate-200 bg-white/62 px-3 py-3 text-sm text-ink-muted">
              Yol sorunları yükleniyor...
            </p>
          ) : null}

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50/80 px-3 py-3 text-sm font-semibold text-red-700">
              Yol sorunları yüklenirken bir hata oluştu.
            </p>
          ) : null}

          {!isLoading && !error && previewIssues.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white/62 px-3 py-3 text-sm text-ink-muted">
              Bu listede gösterilecek yol sorunu yok.
            </p>
          ) : null}

          {!isLoading && !error
            ? previewIssues.map((issue, index) => (
                <PreviewIssueItem
                  index={index}
                  issue={issue}
                  key={issue.id}
                  onIssueSelect={onIssueSelect}
                />
              ))
            : null}
        </div>

        <Link
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
          href={`/issues?tab=${rankingType}`}
        >
          Tümünü gör
          <ExternalLink className="size-4" />
        </Link>
      </GlassPanel>
    </div>
  );
}

function PreviewIssueItem({
  index,
  issue,
  onIssueSelect,
}: {
  index: number;
  issue: PublicIssueRankingRow;
  onIssueSelect: (issueId: string) => void;
}) {
  const intensity = calculateIssueIntensity(issue);

  return (
    <button
      aria-label={`${categoryLabels[issue.category]} haritada göster`}
      className={cn(
        "w-full rounded-2xl border border-slate-200 bg-white/62 p-3 text-left transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
        index >= 3 ? "hidden sm:block" : "",
      )}
      onClick={() => onIssueSelect(issue.id)}
      type="button"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold leading-tight text-ink">
            {categoryLabels[issue.category]}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge>{severityLabels[issue.severity]}</Badge>
            <Badge muted>{statusLabels[issue.status]}</Badge>
            <IntensityBadge level={intensity.level}>
              {intensity.label}
            </IntensityBadge>
          </div>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/72 text-xs font-semibold text-ink-muted">
          {index + 1}
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-ink-muted">
        {issue.reporter_count} bildirim · {issue.verification_count} doğrulama ·{" "}
        {issue.damage_count} hasar
      </p>
      <p className="mt-1 text-xs font-semibold text-ink-subtle">
        {issue.open_days} gündür açık
      </p>
    </button>
  );
}

function Badge({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        muted ? "bg-surface-muted text-ink-muted" : "bg-road-blue text-white",
      )}
    >
      {children}
    </span>
  );
}

function IntensityBadge({
  children,
  level,
}: {
  children: React.ReactNode;
  level: IssueIntensityLevel;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        getIssueIntensityClassName(level),
      )}
    >
      {children}
    </span>
  );
}
