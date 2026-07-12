"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  ExternalLink,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { GlassPanel } from "@/components/map/glass-panel";
import {
  categoryLabels,
  severityLabels,
  statusLabels,
  type RoadIssueCategory,
  type RoadIssueSeverity,
  type RoadIssueStatus,
} from "@/lib/domain/road-issue-options";
import { createOptionalClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

const fixedIssueTabs = [
  { value: "last_7_days", label: "Son 7 günde çözülenler" },
  { value: "last_30_days", label: "Son 30 günde çözülenler" },
  { value: "fastest_solved", label: "En hızlı çözülenler" },
  {
    value: "most_reported",
    label: "En çok bildirildikten sonra çözülenler",
  },
] as const;

type FixedIssuePeriod = (typeof fixedIssueTabs)[number]["value"];

type FixedIssueRow = {
  issue_id: string;
  category: RoadIssueCategory;
  severity: RoadIssueSeverity;
  status: RoadIssueStatus;
  reporter_count: number;
  verification_count: number;
  damage_count: number;
  solved_count: number;
  open_days: number;
  first_reported_at: string;
  solved_at: string;
  location_fallback: string;
};

export function FixedIssuesPage() {
  const [period, setPeriod] = useState<FixedIssuePeriod>("last_7_days");
  const [issues, setIssues] = useState<FixedIssueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIssues = useCallback(
    async (offset: number, append: boolean) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const supabase = createOptionalClient();
      if (!supabase) {
        setError("Yol sorunları yüklenirken bir hata oluştu.");
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc(
        "get_public_fixed_issues",
        {
          p_period: period,
          p_limit: PAGE_SIZE,
          p_offset: offset,
        },
      );

      if (rpcError) {
        if (process.env.NODE_ENV === "development") {
          console.error("get_public_fixed_issues RPC error", rpcError);
        }
        setError("Yol sorunları yüklenirken bir hata oluştu.");
      } else {
        const rows = (data ?? []) as FixedIssueRow[];
        setIssues((current) => (append ? [...current, ...rows] : rows));
        setHasMore(rows.length === PAGE_SIZE);
      }

      setIsLoading(false);
      setIsLoadingMore(false);
    },
    [period],
  );

  useEffect(() => {
    void fetchIssues(0, false);
  }, [fetchIssues]);

  return (
    <AppShell>
      <main className="min-h-dvh bg-surface px-3 py-4 text-ink md:px-6 md:py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <GlassPanel className="p-4 md:p-5">
            <Link
              className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 text-sm font-semibold transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              href="/"
            >
              <ArrowLeft className="size-4" />
              Haritaya dön
            </Link>

            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <CalendarCheck className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-normal text-ink">
                  Son Çözülenler
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                  Kullanıcı bildirimleriyle çözüldü olarak işaretlenen yol
                  sorunlarını incele.
                </p>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-2">
            <div
              aria-label="Çözülen yol sorunları filtresi"
              className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4"
              role="tablist"
            >
              {fixedIssueTabs.map((tab) => {
                const selected = period === tab.value;

                return (
                  <button
                    aria-selected={selected}
                    className={cn(
                      "min-h-11 rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
                      selected
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

          {isLoading ? (
            <GlassPanel className="p-4 text-sm text-ink-muted">
              Çözülen yol sorunları yükleniyor...
            </GlassPanel>
          ) : null}

          {error ? (
            <GlassPanel className="border-red-200 bg-red-50/80 p-4 text-sm font-semibold text-red-700">
              {error}
            </GlassPanel>
          ) : null}

          {!isLoading && !error && issues.length === 0 ? (
            <GlassPanel className="p-4">
              <p className="font-semibold text-ink">
                Bu listede gösterilecek çözülmüş yol sorunu yok.
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                Yalnızca tamamen çözüldü durumundaki kayıtlar burada gösterilir.
              </p>
            </GlassPanel>
          ) : null}

          {!isLoading && !error && issues.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {issues.map((issue) => (
                <FixedIssueCard issue={issue} key={issue.issue_id} />
              ))}
            </div>
          ) : null}

          {!isLoading && !error && hasMore ? (
            <button
              className="mx-auto min-h-11 rounded-full border border-slate-200 bg-white/75 px-5 text-sm font-semibold text-ink shadow-sm transition hover:bg-white disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              disabled={isLoadingMore}
              onClick={() => void fetchIssues(issues.length, true)}
              type="button"
            >
              {isLoadingMore ? "Yükleniyor..." : "Daha fazla göster"}
            </button>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}

function FixedIssueCard({ issue }: { issue: FixedIssueRow }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/62 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white/75 px-2.5 py-1 text-xs font-semibold text-ink">
              {categoryLabels[issue.category]}
            </span>
            <span className="rounded-full border border-slate-200 bg-white/60 px-2.5 py-1 text-xs font-semibold text-ink-muted">
              {severityLabels[issue.severity]}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="size-3.5" />
              {statusLabels[issue.status]}
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{issue.location_fallback}</span>
          </p>
        </div>
        <p className="shrink-0 text-right text-xs font-semibold text-ink-muted">
          {formatSolvedAt(issue.solved_at)}
        </p>
      </div>

      <p className="mt-3 text-sm leading-6 text-ink-muted">
        Bu yol sorunu {issue.open_days} gün açık göründükten sonra çözüldü
        olarak işaretlendi.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Açık süre" value={`${issue.open_days} gün`} />
        <Metric label="Bildiren" value={issue.reporter_count} />
        <Metric label="Doğrulama" value={issue.verification_count} />
        <Metric label="Hasar" value={issue.damage_count} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/72 px-3 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
          href={`/?issue=${issue.issue_id}`}
        >
          <MapPin className="size-4" />
          Haritada gör
        </Link>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-road-blue px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
          href={`/i/${issue.issue_id}`}
        >
          <ExternalLink className="size-4" />
          Detayı gör
        </Link>
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

function formatSolvedAt(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
