"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, LogOut } from "lucide-react";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
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
} from "@/lib/issues/issue-intensity";
import type { ProfileEntry, ProfileSummary } from "@/lib/road-issues/types";
import { createOptionalClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "unconfigured";

type UserReportRow = {
  issue_id: string;
  severity: ProfileEntry["severity"];
  first_reported_at: string;
  withdrawn_at: string | null;
};

type IssueReportRow = {
  issue_id: string;
  report_type: "damage" | "solved" | "false_report" | string;
  created_at: string;
};

type VerificationRow = {
  issue_id: string;
  verified_at: string;
};

type IssueRow = {
  id: string;
  category: ProfileEntry["category"];
  severity: ProfileEntry["severity"];
  status: ProfileEntry["status"];
  latitude: number;
  longitude: number;
  first_reported_at: string;
  reporter_count: number;
  verification_count: number;
  damage_count: number;
  solved_count: number;
  false_report_count: number;
};

const emptySummary: ProfileSummary = {
  active_report_count: 0,
  damage_report_count: 0,
  false_report_count: 0,
  solved_report_count: 0,
  verification_count: 0,
  withdrawn_report_count: 0,
};

export function ProfilePage() {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    supabase ? "loading" : "unconfigured",
  );
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [summary, setSummary] = useState<ProfileSummary>(emptySummary);
  const [entries, setEntries] = useState<ProfileEntry[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [withdrawingIssueId, setWithdrawingIssueId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!supabase) {
      setAuthStatus("unconfigured");
      return;
    }

    const client = supabase;
    let isMounted = true;

    async function loadSession() {
      const { data } = await client.auth.getSession();

      if (!isMounted) {
        return;
      }

      setAuthStatus(data.session ? "authenticated" : "unauthenticated");
      setUserEmail(data.session?.user.email ?? null);
    }

    void loadSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setAuthStatus(session ? "authenticated" : "unauthenticated");
      setUserEmail(session?.user.email ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function loadProfile() {
    if (!supabase || authStatus !== "authenticated") {
      return;
    }

    setIsLoadingProfile(true);
    setProfileError(null);

    const [
      { data: summaryData, error: summaryError },
      { data: entriesData, error: entriesError },
    ] =
      await Promise.all([
        supabase.rpc("get_my_profile_summary"),
        supabase.rpc("get_my_profile_entries"),
      ]);

    if (summaryError || entriesError) {
      if (process.env.NODE_ENV === "development") {
        if (summaryError) {
          console.error("get_my_profile_summary RPC error", summaryError);
        }

        if (entriesError) {
          console.error("get_my_profile_entries RPC error", entriesError);
        }
      }

      const fallback = await loadProfileFromTables();

      if (fallback) {
        setSummary(fallback.summary);
        setEntries(fallback.entries);
        setProfileError(null);
      } else {
        setSummary(emptySummary);
        setEntries([]);
        setProfileError("Profil bilgileri yüklenemedi. Lütfen tekrar dene.");
      }

      setIsLoadingProfile(false);
      return;
    }

    setSummary(parseSummary(summaryData));
    setEntries(parseEntries(entriesData));
    setIsLoadingProfile(false);
  }

  async function loadProfileFromTables() {
    if (!supabase) {
      return null;
    }

    const [
      userReportsResult,
      issueReportsResult,
      verificationsResult,
    ] = await Promise.all([
      supabase
        .from("issue_user_reports")
        .select("issue_id, severity, first_reported_at, withdrawn_at"),
      supabase
        .from("issue_reports")
        .select("issue_id, report_type, created_at"),
      supabase
        .from("issue_user_verifications")
        .select("issue_id, verified_at"),
    ]);

    if (
      userReportsResult.error ||
      issueReportsResult.error ||
      verificationsResult.error
    ) {
      if (process.env.NODE_ENV === "development") {
        console.error("profile fallback query error", {
          issueReportsError: issueReportsResult.error,
          userReportsError: userReportsResult.error,
          verificationsError: verificationsResult.error,
        });
      }

      return null;
    }

    const userReports = parseUserReportRows(userReportsResult.data);
    const issueReports = parseIssueReportRows(issueReportsResult.data);
    const verifications = parseVerificationRows(verificationsResult.data);
    const issueIds = Array.from(
      new Set([
        ...userReports.map((row) => row.issue_id),
        ...issueReports.map((row) => row.issue_id),
        ...verifications.map((row) => row.issue_id),
      ]),
    );

    if (issueIds.length === 0) {
      return {
        entries: [],
        summary: emptySummary,
      };
    }

    const { data: issuesData, error: issuesError } = await supabase
      .from("road_issues")
      .select(
        "id, category, severity, status, latitude, longitude, first_reported_at, reporter_count, verification_count, damage_count, solved_count, false_report_count",
      )
      .in("id", issueIds);

    if (issuesError) {
      if (process.env.NODE_ENV === "development") {
        console.error("profile fallback road_issues query error", issuesError);
      }

      return null;
    }

    const issuesById = new Map(
      parseIssueRows(issuesData).map((issue) => [issue.id, issue]),
    );
    const entries = buildProfileEntriesFromRows({
      issueReports,
      issuesById,
      userReports,
      verifications,
    });

    return {
      entries,
      summary: {
        active_report_count: userReports.filter((row) => !row.withdrawn_at)
          .length,
        damage_report_count: issueReports.filter(
          (row) => row.report_type === "damage",
        ).length,
        false_report_count: issueReports.filter(
          (row) => row.report_type === "false_report",
        ).length,
        solved_report_count: issueReports.filter(
          (row) => row.report_type === "solved",
        ).length,
        verification_count: verifications.length,
        withdrawn_report_count: userReports.filter((row) => row.withdrawn_at)
          .length,
      },
    };
  }

  useEffect(() => {
    if (authStatus === "authenticated") {
      void loadProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setAuthStatus("unauthenticated");
    setUserEmail(null);
    setSummary(emptySummary);
    setEntries([]);
    setFeedback("Çıkış yapıldı.");
  }

  async function handleWithdraw(issueId: string) {
    if (!supabase) {
      return;
    }

    setWithdrawingIssueId(issueId);
    setFeedback(null);

    const { error } = await supabase.rpc("withdraw_issue_report", {
      p_issue_id: issueId,
    });

    setWithdrawingIssueId(null);

    if (error) {
      setFeedback(mapWithdrawError(error.message));
      return;
    }

    setFeedback("Bildirimin geri çekildi.");
    await loadProfile();
  }

  const activeReports = entries.filter(
    (entry) => entry.entry_type === "active_report",
  );
  const withdrawnReports = entries.filter(
    (entry) => entry.entry_type === "withdrawn_report",
  );
  const damageReports = entries.filter((entry) => entry.entry_type === "damage");
  const recentActivity = entries.slice(0, 6);

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
                <h1 className="text-2xl font-semibold tracking-normal text-ink">
                  Profilim
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                  Bildirdiğin yol sorunlarını ve katkılarını buradan takip
                  edebilirsin.
                </p>
                {userEmail ? (
                  <p className="mt-3 text-sm font-semibold text-ink-muted">
                    Hesap: {userEmail}
                  </p>
                ) : null}
              </div>
              {authStatus === "authenticated" ? (
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white"
                  onClick={handleSignOut}
                  type="button"
                >
                  <LogOut className="size-4" />
                  Çıkış yap
                </button>
              ) : null}
            </div>
          </GlassPanel>

          {authStatus !== "authenticated" ? (
            <LoginPanel authStatus={authStatus} />
          ) : (
            <>
              {feedback ? <StatusMessage>{feedback}</StatusMessage> : null}
              {profileError ? (
                <StatusMessage tone="error">{profileError}</StatusMessage>
              ) : null}

              <SummaryCards summary={summary} />

              {isLoadingProfile ? (
                <GlassPanel className="p-4 text-sm text-ink-muted">
                  Profil bilgileri yükleniyor...
                </GlassPanel>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-4">
                    <ProfileSection
                      emptyText="Henüz aktif bildirimin yok."
                      entries={activeReports}
                      title="Aktif bildirimlerim"
                      withdrawingIssueId={withdrawingIssueId}
                      onWithdraw={handleWithdraw}
                    />
                    <ProfileSection
                      emptyText="Geri çekilmiş bildirimin yok."
                      entries={withdrawnReports}
                      title="Geri çekilen bildirimlerim"
                    />
                  </div>
                  <div className="space-y-4">
                    <ProfileSection
                      emptyText="Henüz araç hasarı bildirimin yok."
                      entries={damageReports}
                      title="Araç hasarı bildirimlerim"
                    />
                    <RecentActivity entries={recentActivity} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function LoginPanel({ authStatus }: { authStatus: AuthStatus }) {
  if (authStatus === "loading") {
    return (
      <GlassPanel className="p-4 text-sm text-ink-muted">
        Oturum kontrol ediliyor...
      </GlassPanel>
    );
  }

  if (authStatus === "unconfigured") {
    return (
      <StatusMessage tone="error">
        Profilini görmek için Supabase bağlantısı yapılandırılmalı.
      </StatusMessage>
    );
  }

  return (
    <GlassPanel className="max-w-md p-4">
      <MagicLinkForm title="Profilini görmek için giriş yapmalısın." />
    </GlassPanel>
  );
}

function SummaryCards({ summary }: { summary: ProfileSummary }) {
  const cards = [
    ["Aktif bildirimlerim", summary.active_report_count],
    ["Geri çekilen bildirimlerim", summary.withdrawn_report_count],
    ["Hasar bildirimlerim", summary.damage_report_count],
    ["Doğrulamalarım", summary.verification_count],
    ["Çözüldü bildirimlerim", summary.solved_report_count],
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map(([label, value]) => (
        <GlassPanel className="p-3" key={label}>
          <p className="text-2xl font-semibold text-ink">{value}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-ink-muted">
            {label}
          </p>
        </GlassPanel>
      ))}
    </div>
  );
}

function ProfileSection({
  emptyText,
  entries,
  title,
  withdrawingIssueId,
  onWithdraw,
}: {
  emptyText: string;
  entries: ProfileEntry[];
  title: string;
  withdrawingIssueId?: string | null;
  onWithdraw?: (issueId: string) => void;
}) {
  return (
    <GlassPanel className="p-4">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {entries.map((entry) => (
            <ProfileEntryCard
              entry={entry}
              key={`${entry.entry_type}-${entry.issue_id}-${entry.reported_at}`}
              withdrawingIssueId={withdrawingIssueId}
              onWithdraw={onWithdraw}
            />
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function ProfileEntryCard({
  entry,
  withdrawingIssueId,
  onWithdraw,
}: {
  entry: ProfileEntry;
  withdrawingIssueId?: string | null;
  onWithdraw?: (issueId: string) => void;
}) {
  const canWithdraw = entry.entry_type === "active_report" && onWithdraw;
  const intensity = calculateIssueIntensity({
    ...entry,
    created_at: entry.reported_at,
    last_verified_at: null,
    updated_at: entry.reported_at,
  });

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/62 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{categoryLabels[entry.category]}</Badge>
        <Badge muted>{severityLabels[entry.severity]}</Badge>
        <Badge muted>{statusLabels[entry.status]}</Badge>
        <IntensityBadge level={intensity.level}>
          {intensity.label}
        </IntensityBadge>
      </div>
      <div className="mt-3 grid gap-1 text-sm text-ink-muted">
        <p>Bildirim tarihi: {formatDate(entry.reported_at)}</p>
        {entry.withdrawn_at ? (
          <p>Geri çekilme tarihi: {formatDate(entry.withdrawn_at)}</p>
        ) : null}
        <p>{entry.open_days} gündür açık görünüyor.</p>
        <p>{entry.reporter_count} kullanıcı bildirdi.</p>
        <p>{entry.verification_count} kullanıcı doğruladı.</p>
        <p>{entry.damage_count} araç hasarı bildirildi.</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {entry.issue_is_public ? (
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:bg-white"
            href={`/?issue=${entry.issue_id}`}
          >
            Haritada gör
            <ExternalLink className="size-4" />
          </Link>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm font-semibold text-ink-muted">
            Bu sorun artık aktif listede görünmüyor.
          </p>
        )}
        {canWithdraw ? (
          <button
            className="min-h-11 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={withdrawingIssueId === entry.issue_id}
            onClick={() => onWithdraw(entry.issue_id)}
            type="button"
          >
            {withdrawingIssueId === entry.issue_id
              ? "Geri çekiliyor..."
              : "Bildirimi geri çek"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function RecentActivity({ entries }: { entries: ProfileEntry[] }) {
  return (
    <GlassPanel className="p-4">
      <h2 className="text-base font-semibold text-ink">Son katkılarım</h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Henüz doğrulama yapmadın.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {entries.map((entry) => (
            <div
              className="rounded-2xl border border-slate-200 bg-white/62 p-3 text-sm"
              key={`${entry.entry_type}-${entry.issue_id}-${entry.reported_at}`}
            >
              <p className="font-semibold text-ink">
                {activityLabel(entry.entry_type)}
              </p>
              <p className="mt-1 text-ink-muted">
                {categoryLabels[entry.category]} · {formatDate(entry.reported_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function StatusMessage({
  children,
  tone = "success",
}: {
  children: React.ReactNode;
  tone?: "error" | "success";
}) {
  return (
    <GlassPanel
      className={cn(
        "p-3 text-sm font-semibold",
        tone === "error" ? "text-red-700" : "text-emerald-700",
      )}
    >
      {children}
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
  level: ReturnType<typeof calculateIssueIntensity>["level"];
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

function parseSummary(value: unknown): ProfileSummary {
  const result = Array.isArray(value) ? value[0] : value;

  if (!result || typeof result !== "object") {
    return emptySummary;
  }

  const record = result as Record<string, unknown>;

  return {
    active_report_count: numberField(record.active_report_count),
    damage_report_count: numberField(record.damage_report_count),
    false_report_count: numberField(record.false_report_count),
    solved_report_count: numberField(record.solved_report_count),
    verification_count: numberField(record.verification_count),
    withdrawn_report_count: numberField(record.withdrawn_report_count),
  };
}

function parseEntries(value: unknown): ProfileEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;

    if (
      typeof record.entry_type !== "string" ||
      typeof record.issue_id !== "string" ||
      typeof record.category !== "string" ||
      typeof record.severity !== "string" ||
      typeof record.status !== "string" ||
      typeof record.first_reported_at !== "string" ||
      typeof record.reported_at !== "string"
    ) {
      return [];
    }

    return [
      {
        category: record.category as ProfileEntry["category"],
        damage_count: numberField(record.damage_count),
        entry_type: record.entry_type as ProfileEntry["entry_type"],
        false_report_count: numberField(record.false_report_count),
        first_reported_at: record.first_reported_at,
        issue_id: record.issue_id,
        issue_is_public: Boolean(record.issue_is_public),
        latitude: numberField(record.latitude),
        longitude: numberField(record.longitude),
        open_days: numberField(record.open_days),
        reported_at: record.reported_at,
        reporter_count: numberField(record.reporter_count),
        severity: record.severity as ProfileEntry["severity"],
        solved_count: numberField(record.solved_count),
        status: record.status as ProfileEntry["status"],
        verification_count: numberField(record.verification_count),
        withdrawn_at:
          typeof record.withdrawn_at === "string" ? record.withdrawn_at : null,
      },
    ];
  });
}

function parseUserReportRows(value: unknown): UserReportRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;

    if (
      typeof record.issue_id !== "string" ||
      typeof record.severity !== "string" ||
      typeof record.first_reported_at !== "string"
    ) {
      return [];
    }

    return [
      {
        first_reported_at: record.first_reported_at,
        issue_id: record.issue_id,
        severity: record.severity as UserReportRow["severity"],
        withdrawn_at:
          typeof record.withdrawn_at === "string" ? record.withdrawn_at : null,
      },
    ];
  });
}

function parseIssueReportRows(value: unknown): IssueReportRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;

    if (
      typeof record.issue_id !== "string" ||
      typeof record.report_type !== "string" ||
      typeof record.created_at !== "string"
    ) {
      return [];
    }

    return [
      {
        created_at: record.created_at,
        issue_id: record.issue_id,
        report_type: record.report_type,
      },
    ];
  });
}

function parseVerificationRows(value: unknown): VerificationRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;

    if (
      typeof record.issue_id !== "string" ||
      typeof record.verified_at !== "string"
    ) {
      return [];
    }

    return [
      {
        issue_id: record.issue_id,
        verified_at: record.verified_at,
      },
    ];
  });
}

function parseIssueRows(value: unknown): IssueRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;

    if (
      typeof record.id !== "string" ||
      typeof record.category !== "string" ||
      typeof record.severity !== "string" ||
      typeof record.status !== "string" ||
      typeof record.first_reported_at !== "string"
    ) {
      return [];
    }

    return [
      {
        category: record.category as IssueRow["category"],
        damage_count: numberField(record.damage_count),
        false_report_count: numberField(record.false_report_count),
        first_reported_at: record.first_reported_at,
        id: record.id,
        latitude: numberField(record.latitude),
        longitude: numberField(record.longitude),
        reporter_count: numberField(record.reporter_count),
        severity: record.severity as IssueRow["severity"],
        solved_count: numberField(record.solved_count),
        status: record.status as IssueRow["status"],
        verification_count: numberField(record.verification_count),
      },
    ];
  });
}

function buildProfileEntriesFromRows({
  issueReports,
  issuesById,
  userReports,
  verifications,
}: {
  issueReports: IssueReportRow[];
  issuesById: Map<string, IssueRow>;
  userReports: UserReportRow[];
  verifications: VerificationRow[];
}) {
  const entries: ProfileEntry[] = [];

  for (const row of userReports) {
    const issue = issuesById.get(row.issue_id);

    if (!issue) {
      continue;
    }

    entries.push(toProfileEntry({
      entryType: row.withdrawn_at ? "withdrawn_report" : "active_report",
      issue,
      reportedAt: row.first_reported_at,
      withdrawnAt: row.withdrawn_at,
    }));
  }

  for (const row of issueReports) {
    if (
      row.report_type !== "damage" &&
      row.report_type !== "solved" &&
      row.report_type !== "false_report"
    ) {
      continue;
    }

    const issue = issuesById.get(row.issue_id);

    if (!issue) {
      continue;
    }

    entries.push(toProfileEntry({
      entryType: row.report_type,
      issue,
      reportedAt: row.created_at,
      withdrawnAt: null,
    }));
  }

  for (const row of verifications) {
    const issue = issuesById.get(row.issue_id);

    if (!issue) {
      continue;
    }

    entries.push(toProfileEntry({
      entryType: "verified",
      issue,
      reportedAt: row.verified_at,
      withdrawnAt: null,
    }));
  }

  return entries.sort(
    (left, right) =>
      new Date(right.reported_at).getTime() -
      new Date(left.reported_at).getTime(),
  );
}

function toProfileEntry({
  entryType,
  issue,
  reportedAt,
  withdrawnAt,
}: {
  entryType: ProfileEntry["entry_type"];
  issue: IssueRow;
  reportedAt: string;
  withdrawnAt: string | null;
}): ProfileEntry {
  return {
    category: issue.category,
    damage_count: issue.damage_count,
    entry_type: entryType,
    false_report_count: issue.false_report_count,
    first_reported_at: issue.first_reported_at,
    issue_id: issue.id,
    issue_is_public: issue.reporter_count > 0,
    latitude: issue.latitude,
    longitude: issue.longitude,
    open_days: daysOpen(issue.first_reported_at),
    reported_at: reportedAt,
    reporter_count: issue.reporter_count,
    severity: issue.severity,
    solved_count: issue.solved_count,
    status: issue.status,
    verification_count: issue.verification_count,
    withdrawn_at: withdrawnAt,
  };
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysOpen(firstReportedAt: string) {
  const started = new Date(firstReportedAt).getTime();
  const diff = Math.max(Date.now() - started, 0);

  return Math.max(Math.floor(diff / 86_400_000), 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function activityLabel(type: ProfileEntry["entry_type"]) {
  switch (type) {
    case "active_report":
      return "Yol sorunu bildirdin";
    case "withdrawn_report":
      return "Bildirimi geri çektin";
    case "damage":
      return "Araç hasarı bildirdin";
    case "solved":
      return "Çözüldü bildirimi yaptın";
    case "false_report":
      return "Yanlış konum geri bildirimi yaptın";
    case "verified":
      return "Yol sorununu doğruladın";
  }
}

function mapWithdrawError(message: string) {
  if (message.includes("no_issue_report_to_withdraw")) {
    return "Bu yol sorunu için geri çekebileceğin bir bildirimin yok.";
  }

  if (message.includes("issue_report_already_withdrawn")) {
    return "Bu bildirim zaten geri çekilmiş.";
  }

  return "Bildirimi geri çekerken hata oluştu.";
}
