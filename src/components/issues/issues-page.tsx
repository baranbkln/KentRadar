"use client";

import { ArrowLeft, ExternalLink, ListFilter } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
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
import type {
  PublicIssueRankingRow,
  PublicIssueRankingType,
} from "@/lib/road-issues/types";
import {
  getIssueRankingTab,
  issueRankingTabs,
} from "@/lib/road-issues/rankings";
import { cn } from "@/lib/utils";

export function IssuesPage() {
  const searchParams = useSearchParams();
  const initialRankingType = parseRankingType(searchParams.get("tab"));
  const [rankingType, setRankingType] =
    useState<PublicIssueRankingType>(initialRankingType);
  const { error, isLoading, rankings } = usePublicIssueRankings(rankingType);
  const activeTab = getIssueRankingTab(rankingType);

  return (
    <AppShell>
      <main className="min-h-dvh bg-surface px-3 py-4 text-ink md:px-6 md:py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <GlassPanel className="p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <Link
                  className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
                  href="/"
                >
                  <ArrowLeft className="size-4" />
                  Haritaya dön
                </Link>
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-white/72 text-road-blue">
                    <ListFilter className="size-5" />
                  </span>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-normal text-ink">
                      Yol Sorunları
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                      Kullanıcıların bildirdiği açık yol sorunlarını yoğunluk,
                      doğrulama ve süreye göre incele.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-3">
            <div
              aria-label="Yol sorunu sıralaması"
              className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"
              role="tablist"
            >
              {issueRankingTabs.map((tab) => {
                const isSelected = tab.value === rankingType;

                return (
                  <button
                    aria-selected={isSelected}
                    className={cn(
                      "min-h-11 rounded-2xl border px-3 py-2 text-left text-xs font-semibold leading-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
                      isSelected
                        ? "border-road-blue bg-white text-ink shadow-sm"
                        : "border-slate-200 bg-white/55 text-ink-muted hover:bg-white",
                    )}
                    key={tab.value}
                    onClick={() => setRankingType(tab.value)}
                    role="tab"
                    type="button"
                  >
                    {tab.fullLabel}
                  </button>
                );
              })}
            </div>
          </GlassPanel>

          {activeTab ? (
            <p className="px-2 text-sm leading-6 text-ink-muted">
              {activeTab.description}
            </p>
          ) : null}

          {isLoading ? (
            <GlassPanel className="p-4 text-sm text-ink-muted">
              Yol sorunları yükleniyor...
            </GlassPanel>
          ) : null}

          {error ? (
            <GlassPanel className="border-red-200 bg-red-50/80 p-4 text-sm font-semibold text-red-700">
              {error}
            </GlassPanel>
          ) : null}

          {!isLoading && !error && rankings.length === 0 ? (
            <GlassPanel className="p-4 text-sm text-ink-muted">
              Bu listede gösterilecek yol sorunu yok.
            </GlassPanel>
          ) : null}

          {!isLoading && !error && rankings.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {rankings.map((issue, index) => (
                <IssueRankingCard
                  index={index}
                  issue={issue}
                  key={issue.id}
                  rankingType={rankingType}
                />
              ))}
            </div>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}

function IssueRankingCard({
  index,
  issue,
  rankingType,
}: {
  index: number;
  issue: PublicIssueRankingRow;
  rankingType: PublicIssueRankingType;
}) {
  const intensity = calculateIssueIntensity(issue);

  return (
    <GlassPanel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>{categoryLabels[issue.category]}</Badge>
            <Badge muted>{severityLabels[issue.severity]}</Badge>
            <Badge muted>{statusLabels[issue.status]}</Badge>
          </div>
          <h2 className="text-lg font-semibold leading-tight text-ink">
            {categoryLabels[issue.category]}
          </h2>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/72 text-sm font-semibold text-ink-muted">
          {index + 1}
        </span>
      </div>

      <div className="mt-3">
        <IntensityBadge level={intensity.level}>{intensity.label}</IntensityBadge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-ink-muted">
        <Metric label="Bildiren" value={`${issue.reporter_count} kullanıcı`} />
        <Metric
          label="Doğrulama"
          value={`${issue.verification_count} kullanıcı`}
        />
        <Metric label="Hasar" value={`${issue.damage_count} bildirim`} />
        <Metric label="Açık süre" value={`${issue.open_days} gün`} />
      </div>

      <p className="mt-4 text-sm leading-6 text-ink-muted">
        Bu yol sorunu {issue.open_days} gündür açık görünüyor.
      </p>

      <div className="mt-3 space-y-1 text-xs leading-5 text-ink-subtle">
        <p>İlk bildirim: {formatDate(issue.first_reported_at)}</p>
        <p>Son doğrulama: {formatLastVerified(issue.last_verified_at)}</p>
        <p>{getRankingHint(rankingType, issue)}</p>
      </div>

      <Link
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue sm:w-auto"
        href={`/?issue=${issue.id}`}
      >
        Haritada gör
        <ExternalLink className="size-4" />
      </Link>
    </GlassPanel>
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
        "rounded-full px-2.5 py-1 text-xs font-semibold",
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
        "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold",
        getIssueIntensityClassName(level),
      )}
    >
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/55 p-3">
      <p className="text-[11px] font-semibold uppercase text-ink-subtle">
        {label}
      </p>
      <p className="mt-1 font-semibold text-ink">{value}</p>
    </div>
  );
}

function getRankingHint(
  rankingType: PublicIssueRankingType,
  issue: PublicIssueRankingRow,
) {
  if (rankingType === "most_reported") {
    return `${issue.reporter_count} kullanıcı bu yol sorununu bildirdi.`;
  }

  if (rankingType === "most_verified") {
    return `${issue.verification_count} kullanıcı bu yol sorununu doğruladı.`;
  }

  if (rankingType === "most_damage") {
    return `${issue.damage_count} araç hasarı bildirildi.`;
  }

  if (rankingType === "longest_open") {
    return `${issue.open_days} gündür açık görünüyor.`;
  }

  if (rankingType === "recently_verified") {
    return `Son doğrulama: ${formatLastVerified(issue.last_verified_at)}.`;
  }

  return `Haritaya eklenme: ${formatDate(issue.created_at)}.`;
}

function formatLastVerified(value: string | null) {
  if (!value) {
    return "henüz doğrulanmadı";
  }

  return formatDate(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function parseRankingType(value: string | null): PublicIssueRankingType {
  const matchedTab = issueRankingTabs.find((tab) => tab.value === value);

  return matchedTab?.value ?? "most_reported";
}
