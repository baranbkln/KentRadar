import { ArrowLeft, ListFilter, MapPinned } from "lucide-react";
import Link from "next/link";
import { IssueShareActions } from "@/components/issues/issue-share-actions";
import { IssueWatchButton } from "@/components/issues/issue-watch-button";
import { AppShell } from "@/components/layout/app-shell";
import { GlassPanel } from "@/components/map/glass-panel";
import {
  categoryLabels,
  severityLabels,
  statusLabels,
} from "@/lib/domain/road-issue-options";
import {
  calculateIssueIntensity,
  getIssueIntensityClassName,
  getIssueIntensityDescription,
  type IssueIntensityLevel,
} from "@/lib/issues/issue-intensity";
import { formatIssueLocation } from "@/lib/road-issues/location";
import type { PublicIssueRankingRow } from "@/lib/road-issues/types";
import { cn } from "@/lib/utils";

type PublicIssueDetailPageProps = {
  issue: PublicIssueRankingRow;
};

export function PublicIssueDetailPage({ issue }: PublicIssueDetailPageProps) {
  const intensity = calculateIssueIntensity(issue);
  const location = formatIssueLocation(issue);

  return (
    <AppShell>
      <main className="min-h-dvh bg-surface px-3 py-4 text-ink md:px-6 md:py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              href="/"
            >
              <ArrowLeft className="size-4" />
              Haritaya dön
            </Link>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              href="/issues"
            >
              <ListFilter className="size-4" />
              Sorun listesine dön
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <GlassPanel className="p-4 md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge>{categoryLabels[issue.category]}</Badge>
                      <Badge muted>{severityLabels[issue.severity]}</Badge>
                      <Badge muted>{statusLabels[issue.status]}</Badge>
                      <IntensityBadge level={intensity.level}>
                        {intensity.label}
                      </IntensityBadge>
                    </div>
                    <h1 className="text-2xl font-semibold leading-tight tracking-normal text-ink md:text-3xl">
                      {categoryLabels[issue.category]}
                    </h1>
                    <p className="mt-2 text-sm font-semibold text-ink-muted">
                      {location}
                    </p>
                    <p className="mt-4 text-base leading-7 text-ink-muted">
                      Bu yol sorunu {issue.open_days} gündür açık görünüyor.
                    </p>
                  </div>
                </div>
              </GlassPanel>

              <GlassPanel className="p-4">
                <h2 className="text-base font-semibold text-ink">Özet</h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {getIssueIntensityDescription(issue)}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
                  <Metric label="Bildiren" value={issue.reporter_count} />
                  <Metric label="Doğrulayan" value={issue.verification_count} />
                  <Metric label="Hasar" value={issue.damage_count} />
                  <Metric label="Çözüldü bildirimi" value={issue.solved_count} />
                  <Metric
                    label="Yanlış/burada değil"
                    value={issue.false_report_count}
                  />
                </div>
              </GlassPanel>

              <GlassPanel className="p-4">
                <h2 className="text-base font-semibold text-ink">Zaman bilgisi</h2>
                <div className="mt-3 grid gap-2 text-sm text-ink-muted md:grid-cols-3">
                  <DateInfo label="İlk bildirim" value={issue.first_reported_at} />
                  <DateInfo
                    emptyText="Henüz doğrulanmadı"
                    label="Son doğrulama"
                    value={issue.last_verified_at}
                  />
                  <DateInfo label="Son güncelleme" value={issue.updated_at} />
                </div>
              </GlassPanel>
            </div>

            <aside className="space-y-4">
              <GlassPanel className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/72 text-road-blue">
                    <MapPinned className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-ink">Konum</h2>
                    <p className="mt-1 text-sm leading-5 text-ink-muted">
                      {location}
                    </p>
                  </div>
                </div>
                <Link
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
                  href={`/?issue=${issue.id}`}
                >
                  Haritada gör
                  <MapPinned className="size-4" />
                </Link>
              </GlassPanel>

              <IssueWatchButton
                initialWatcherCount={issue.watcher_count}
                issueId={issue.id}
                showDescription
              />

              <IssueShareActions issue={issue} />
            </aside>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

export function PublicIssueNotFound() {
  return (
    <AppShell>
      <main className="flex min-h-dvh items-center justify-center bg-surface px-3 py-6 text-ink">
        <GlassPanel className="max-w-lg p-5 text-center">
          <h1 className="text-xl font-semibold text-ink">
            Yol sorunu bulunamadı
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Bu yol sorunu bulunamadı veya artık aktif haritada görünmüyor.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
              href="/"
            >
              Haritaya dön
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:bg-white"
              href="/issues"
            >
              Sorun listesine dön
            </Link>
          </div>
        </GlassPanel>
      </main>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/55 p-3">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-ink-muted">
        {label}
      </p>
    </div>
  );
}

function DateInfo({
  emptyText = "Bilgi yok",
  label,
  value,
}: {
  emptyText?: string;
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/55 p-3">
      <p className="text-[11px] font-semibold uppercase text-ink-subtle">
        {label}
      </p>
      <p className="mt-1 font-semibold text-ink">
        {value ? formatDate(value) : emptyText}
      </p>
    </div>
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
        "rounded-full border px-2.5 py-1 text-xs font-semibold",
        getIssueIntensityClassName(level),
      )}
    >
      {children}
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
