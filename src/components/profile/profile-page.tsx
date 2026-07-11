"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, LogOut, MapPin } from "lucide-react";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { AppShell } from "@/components/layout/app-shell";
import { GlassPanel } from "@/components/map/glass-panel";
import { useCivicDashboard } from "@/hooks/use-civic-dashboard";
import { useCivicScore } from "@/hooks/use-civic-score";
import {
  categoryLabels,
  severityLabels,
  statusLabels,
} from "@/lib/domain/road-issue-options";
import {
  calculateIssueIntensity,
  getIssueIntensityClassName,
} from "@/lib/issues/issue-intensity";
import {
  formatScoreEventLabel,
  formatScoreStatusLabel,
  type CivicScoreEvent,
  type CivicScoreSummary,
} from "@/lib/score/types";
import type {
  CivicDashboard,
  ProfileEntry,
  ProfileSummary,
  ProfileWatchedIssue,
} from "@/lib/road-issues/types";
import { createOptionalClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "unconfigured";
type ProfileTab = "active" | "damage" | "verified" | "watching" | "withdrawn" | "solved";

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
  const [watchedIssues, setWatchedIssues] = useState<ProfileWatchedIssue[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [withdrawingIssueId, setWithdrawingIssueId] = useState<string | null>(
    null,
  );
  const [unwatchingIssueId, setUnwatchingIssueId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<ProfileTab>("active");
  const {
    dashboard,
    dashboardError,
    isLoadingDashboard,
    loadDashboard,
    resetDashboard,
  } = useCivicDashboard(supabase);
  const {
    isLoadingScore,
    loadScore,
    resetScore,
    scoreError,
    scoreEvents,
    scoreSummary,
  } = useCivicScore(supabase);

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
      { data: watchedData, error: watchedError },
      dashboardData,
      scoreData,
    ] =
      await Promise.all([
        supabase.rpc("get_my_profile_summary"),
        supabase.rpc("get_my_profile_entries"),
        supabase.rpc("get_my_watched_issues"),
        loadDashboard(),
        loadScore(),
      ]);

    void dashboardData;
    void scoreData;

    if (watchedError && process.env.NODE_ENV === "development") {
      console.error("get_my_watched_issues RPC error", watchedError);
    }

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
        setWatchedIssues([]);
        setProfileError(null);
      } else {
        setSummary(emptySummary);
        setEntries([]);
        setWatchedIssues([]);
        setProfileError("Profil bilgileri yüklenemedi. Lütfen tekrar dene.");
      }

      setIsLoadingProfile(false);
      return;
    }

    setSummary(parseSummary(summaryData));
    setEntries(parseEntries(entriesData));
    setWatchedIssues(watchedError ? [] : parseWatchedIssues(watchedData));
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
    setWatchedIssues([]);
    resetDashboard();
    resetScore();
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

  async function handleUnwatch(issueId: string) {
    if (!supabase) {
      return;
    }

    setUnwatchingIssueId(issueId);
    setFeedback(null);

    const { error } = await supabase.rpc("unfollow_issue", {
      p_issue_id: issueId,
    });

    setUnwatchingIssueId(null);

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("unfollow_issue RPC error", error);
      }

      setFeedback("Takip durumu güncellenirken bir hata oluştu.");
      return;
    }

    setFeedback("Sorun takip listenden çıkarıldı.");
    await loadProfile();
  }

  const activeReports = entries.filter(
    (entry) => entry.entry_type === "active_report",
  );
  const withdrawnReports = entries.filter(
    (entry) => entry.entry_type === "withdrawn_report",
  );
  const damageReports = entries.filter((entry) => entry.entry_type === "damage");
  const verificationReports = entries.filter(
    (entry) => entry.entry_type === "verified",
  );
  const solvedReports = entries.filter((entry) => entry.entry_type === "solved");
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
              {dashboardError ? (
                <StatusMessage tone="error">{dashboardError}</StatusMessage>
              ) : null}
              {scoreError ? (
                <StatusMessage tone="error">{scoreError}</StatusMessage>
              ) : null}

              <CivicDashboardPanel
                dashboard={dashboardError ? toDashboardFallback(summary, watchedIssues.length) : dashboard}
                isLoading={isLoadingDashboard}
              />
              <CivicScorePanel
                events={scoreEvents}
                isLoading={isLoadingScore}
                summary={scoreSummary}
              />
              <ProfileTabs
                activeTab={activeTab}
                counts={{
                  active: activeReports.length,
                  damage: damageReports.length,
                  solved: solvedReports.length,
                  verified: verificationReports.length,
                  watching: watchedIssues.length,
                  withdrawn: withdrawnReports.length,
                }}
                onChange={setActiveTab}
              />

              {isLoadingProfile ? (
                <GlassPanel className="p-4 text-sm text-ink-muted">
                  Profil bilgileri yükleniyor...
                </GlassPanel>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
                  {activeTab === "active" ? (
                    <ProfileSection
                      emptyText="Henüz aktif bildirimin yok."
                      entries={activeReports}
                      title="Aktif bildirimlerim"
                      withdrawingIssueId={withdrawingIssueId}
                      onWithdraw={handleWithdraw}
                    />
                  ) : null}
                  {activeTab === "damage" ? (
                    <ProfileSection
                      emptyText="Henüz araç hasarı bildirimin yok."
                      entries={damageReports}
                      title="Araç hasarı bildirimlerim"
                    />
                  ) : null}
                  {activeTab === "verified" ? (
                    <ProfileSection
                      emptyText="Henüz doğrulama yapmadın."
                      entries={verificationReports}
                      title="Doğrulamalarım"
                    />
                  ) : null}
                  {activeTab === "watching" ? (
                    <WatchedIssuesSection
                      issues={watchedIssues}
                      unwatchingIssueId={unwatchingIssueId}
                      onUnwatch={handleUnwatch}
                    />
                  ) : null}
                  {activeTab === "withdrawn" ? (
                    <ProfileSection
                      emptyText="Geri çekilmiş bildirimin yok."
                      entries={withdrawnReports}
                      title="Geri çekilen bildirimlerim"
                    />
                  ) : null}
                  {activeTab === "solved" ? (
                    <ProfileSection
                      emptyText="Henüz çözüldü bildirimin yok."
                      entries={solvedReports}
                      title="Çözüldü bildirimlerim"
                    />
                  ) : null}
                  <RecentActivity entries={recentActivity} />
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

function CivicDashboardPanel({
  dashboard,
  isLoading,
}: {
  dashboard: CivicDashboard;
  isLoading: boolean;
}) {
  const contributionCards = [
    ["Bildirdiğin sorunlar", dashboard.active_report_count],
    ["Takip ettiklerin", dashboard.watched_issue_count],
    ["Doğruladıkların", dashboard.verification_count],
    ["Hasar bildirimlerin", dashboard.damage_report_count],
    ["Çözüldü işaretlerin", dashboard.solved_report_count],
    ["Geri çekilenler", dashboard.withdrawn_report_count],
  ] as const;
  const hasImpact =
    dashboard.received_verification_count > 0 ||
    dashboard.received_damage_count > 0 ||
    dashboard.received_solved_count > 0 ||
    dashboard.received_watcher_count > 0 ||
    dashboard.active_reporter_count_on_my_issues > 0;

  return (
    <GlassPanel className="p-4 md:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-ink-subtle">
            Profil özeti
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink">
            Kişisel Etki Karnesi
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
            YolDurumu’na yaptığın katkıların ve takip ettiğin sorunların özeti.
          </p>
        </div>
        {isLoading ? (
          <p className="text-sm font-semibold text-ink-muted">
            Karne güncelleniyor...
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {contributionCards.map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} />
        ))}
      </div>

      <div className="mt-4 rounded-[24px] border border-slate-200 bg-white/58 p-3 md:p-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink">Etki özeti</h3>
            <p className="mt-1 text-sm leading-5 text-ink-muted">
              Bildirdiğin sorunlar etkileşim aldıkça burada özetlenir.
            </p>
          </div>
          {dashboard.highest_interaction_issue_id ? (
            <Link
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 text-sm font-semibold text-ink transition hover:bg-white"
              href={`/?issue=${dashboard.highest_interaction_issue_id}`}
            >
              En etkileşimli bildirimi gör
              <MapPin className="size-4" />
            </Link>
          ) : null}
        </div>

        {hasImpact ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <ImpactLine
              label="Bağımsız doğrulama"
              text={`Bildirdiğin sorunlar ${dashboard.received_verification_count} doğrulama aldı.`}
            />
            <ImpactLine
              label="Hasar bildirimi"
              text={`Bildirdiğin sorunlarda ${dashboard.received_damage_count} araç hasarı bildirildi.`}
            />
            <ImpactLine
              label="Çözüldü işaretleri"
              text={`${dashboard.received_solved_count} çözüldü işareti bu bildirimlere geldi.`}
            />
            <ImpactLine
              label="Takip"
              text={`Bildirdiğin sorunlar toplam ${dashboard.received_watcher_count} kez takip ediliyor.`}
            />
            <ImpactLine
              label="Ortalama açık süre"
              text={`${formatNumber(dashboard.avg_open_days_on_my_active_issues)} gün açık görünüyor.`}
            />
            <ImpactLine
              label="Toplam bildiren"
              text={`Bu sorunlarda toplam ${dashboard.active_reporter_count_on_my_issues} aktif bildirim var.`}
            />
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-ink-muted">
            Henüz bildirim yapmadın. Haritadan bir yol sorunu ekleyerek katkı
            sağlamaya başlayabilirsin.
          </p>
        )}
      </div>
    </GlassPanel>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/62 p-3">
      <p className="text-xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-ink-muted">
        {label}
      </p>
    </div>
  );
}

function ImpactLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/64 p-3">
      <p className="text-xs font-semibold uppercase text-ink-subtle">{label}</p>
      <p className="mt-1 text-sm leading-5 text-ink">{text}</p>
    </div>
  );
}

function CivicScorePanel({
  events,
  isLoading,
  summary,
}: {
  events: CivicScoreEvent[];
  isLoading: boolean;
  summary: CivicScoreSummary;
}) {
  return (
    <GlassPanel className="p-4 md:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-ink-subtle">
            Katkı seviyesi
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Etki Puanı</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
            Etki Puanı, YolDurumu’na yaptığın doğrulanabilir katkıları gösterir.
          </p>
        </div>
        {isLoading ? (
          <p className="text-sm font-semibold text-ink-muted">
            Puan bilgileri güncelleniyor...
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <ScoreMetricCard
          helper="Kalıcı katkı puanın."
          label="Kesinleşmiş puan"
          value={summary.confirmed_points}
        />
        <ScoreMetricCard
          helper="Katkıların desteklendikçe kesinleşir."
          label="Bekleyen puan"
          value={summary.pending_points}
        />
        <div className="rounded-2xl border border-slate-200 bg-white/62 p-3">
          <p className="text-xs font-semibold uppercase text-ink-subtle">
            Seviye
          </p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {summary.level_label}
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Seviye yalnızca profilinde gösterilir; sıralama değildir.
          </p>
        </div>
      </div>

      <p className="mt-3 rounded-2xl border border-slate-200 bg-white/58 px-3 py-2 text-sm leading-5 text-ink-muted">
        Bekleyen puanlar, katkıların başka kullanıcılar tarafından
        desteklendikçe kesinleşir. Yanlış veya geri çekilen bildirimlerden
        gelen puanlar geri alınabilir.
      </p>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">Katkı geçmişi</h3>
          <p className="text-xs font-semibold text-ink-subtle">Son 10 kayıt</p>
        </div>
        {events.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-slate-200 bg-white/64 px-3 py-2 text-sm text-ink-muted">
            Etki puanı Stage 11’den itibaren takip edilir. Yeni katkıların
            burada görünecek.
          </p>
        ) : (
          <div className="mt-3 grid gap-2">
            {events.map((event) => (
              <ScoreEventRow
                event={event}
                key={`${event.event_type}-${event.issue_id ?? "none"}-${event.created_at}`}
              />
            ))}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

function ScoreMetricCard({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/62 p-3">
      <p className="text-xs font-semibold uppercase text-ink-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{helper}</p>
    </div>
  );
}

function ScoreEventRow({ event }: { event: CivicScoreEvent }) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/62 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-ink">
          {formatScoreEventLabel(event.event_type)}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {formatDate(event.created_at)} · {formatScoreStatusLabel(event.status)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-semibold",
            event.status === "confirmed"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : event.status === "pending"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-white/80 text-ink-muted",
          )}
        >
          +{event.points}
        </span>
        {event.issue_id ? (
          <Link
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-ink transition hover:bg-white"
            href={`/?issue=${event.issue_id}`}
          >
            Haritada gör
            <MapPin className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function ProfileTabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: ProfileTab;
  counts: Record<ProfileTab, number>;
  onChange: (tab: ProfileTab) => void;
}) {
  const tabs: { label: string; value: ProfileTab }[] = [
    { label: "Aktif", value: "active" },
    { label: "Hasar", value: "damage" },
    { label: "Doğrulama", value: "verified" },
    { label: "Takip", value: "watching" },
    { label: "Geri çekilen", value: "withdrawn" },
    { label: "Çözüldü", value: "solved" },
  ];

  return (
    <GlassPanel className="p-2">
      <div
        aria-label="Profil bölümleri"
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6"
        role="tablist"
      >
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.value;

          return (
            <button
              aria-selected={isSelected}
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
                isSelected
                  ? "border-road-blue bg-white text-ink shadow-sm"
                  : "border-transparent bg-white/45 text-ink-muted hover:bg-white/75 hover:text-ink",
              )}
              key={tab.value}
              onClick={() => onChange(tab.value)}
              role="tab"
              type="button"
            >
              {tab.label}
              <span className="text-xs text-ink-subtle">{counts[tab.value]}</span>
            </button>
          );
        })}
      </div>
    </GlassPanel>
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
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{categoryLabels[entry.category]}</Badge>
        <Badge muted>{severityLabels[entry.severity]}</Badge>
        <Badge muted>{statusLabels[entry.status]}</Badge>
        <IntensityBadge level={intensity.level}>
          {intensity.label}
        </IntensityBadge>
      </div>
      <div className="mt-3 grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
        <p>{formatDate(entry.reported_at)}</p>
        {entry.withdrawn_at ? (
          <p>Geri çekildi: {formatDate(entry.withdrawn_at)}</p>
        ) : null}
        <p>{entry.open_days} gündür açık görünüyor.</p>
        <p>
          {entry.reporter_count} bildirim · {entry.verification_count} doğrulama ·{" "}
          {entry.damage_count} hasar
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {entry.issue_is_public ? (
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:bg-white"
            href={`/?issue=${entry.issue_id}`}
          >
            Haritada gör
            <MapPin className="size-4" />
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

function WatchedIssuesSection({
  issues,
  unwatchingIssueId,
  onUnwatch,
}: {
  issues: ProfileWatchedIssue[];
  unwatchingIssueId: string | null;
  onUnwatch: (issueId: string) => void;
}) {
  return (
    <GlassPanel className="p-4">
      <h2 className="text-base font-semibold text-ink">
        Takip ettiğim sorunlar
      </h2>
      {issues.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          Henüz takip ettiğin yol sorunu yok.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {issues.map((issue) => (
            <WatchedIssueCard
              issue={issue}
              key={issue.issue_id}
              unwatchingIssueId={unwatchingIssueId}
              onUnwatch={onUnwatch}
            />
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function WatchedIssueCard({
  issue,
  unwatchingIssueId,
  onUnwatch,
}: {
  issue: ProfileWatchedIssue;
  unwatchingIssueId: string | null;
  onUnwatch: (issueId: string) => void;
}) {
  const intensity = calculateIssueIntensity({
    ...issue,
    created_at: issue.watched_at,
    updated_at: issue.watched_at,
  });

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/62 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{categoryLabels[issue.category]}</Badge>
        <Badge muted>{severityLabels[issue.severity]}</Badge>
        <Badge muted>{statusLabels[issue.status]}</Badge>
        <IntensityBadge level={intensity.level}>
          {intensity.label}
        </IntensityBadge>
      </div>
      <div className="mt-3 grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
        <p>Takip: {formatDate(issue.watched_at)}</p>
        <p>{issue.open_days} gündür açık görünüyor.</p>
        <p>
          {issue.reporter_count} bildirim · {issue.verification_count} doğrulama
        </p>
        {issue.watcher_count > 0 ? <p>{issue.watcher_count} takip</p> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {issue.issue_is_public ? (
          <>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:bg-white"
              href={`/?issue=${issue.issue_id}`}
            >
              Haritada gör
              <MapPin className="size-4" />
            </Link>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:bg-white"
              href={`/i/${issue.issue_id}`}
            >
              Detayı gör
              <ExternalLink className="size-4" />
            </Link>
          </>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm font-semibold text-ink-muted">
            Bu sorun artık aktif listede görünmüyor.
          </p>
        )}
        <button
          className="min-h-11 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={unwatchingIssueId === issue.issue_id}
          onClick={() => onUnwatch(issue.issue_id)}
          type="button"
        >
          {unwatchingIssueId === issue.issue_id
            ? "Güncelleniyor..."
            : "Takip ediliyor"}
        </button>
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

function parseWatchedIssues(value: unknown): ProfileWatchedIssue[] {
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
      typeof record.category !== "string" ||
      typeof record.severity !== "string" ||
      typeof record.status !== "string" ||
      typeof record.first_reported_at !== "string" ||
      typeof record.watched_at !== "string"
    ) {
      return [];
    }

    return [
      {
        category: record.category as ProfileWatchedIssue["category"],
        damage_count: numberField(record.damage_count),
        false_report_count: numberField(record.false_report_count),
        first_reported_at: record.first_reported_at,
        issue_id: record.issue_id,
        issue_is_public:
          typeof record.issue_is_public === "boolean"
            ? record.issue_is_public
            : true,
        last_verified_at:
          typeof record.last_verified_at === "string"
            ? record.last_verified_at
            : null,
        latitude: numberField(record.latitude),
        longitude: numberField(record.longitude),
        open_days: numberField(record.open_days),
        reporter_count: numberField(record.reporter_count),
        severity: record.severity as ProfileWatchedIssue["severity"],
        solved_count: numberField(record.solved_count),
        status: record.status as ProfileWatchedIssue["status"],
        verification_count: numberField(record.verification_count),
        watched_at: record.watched_at,
        watcher_count: numberField(record.watcher_count),
      },
    ];
  });
}

function toDashboardFallback(
  summary: ProfileSummary,
  watchedCount: number,
): CivicDashboard {
  return {
    ...summary,
    active_reporter_count_on_my_issues: summary.active_report_count,
    avg_open_days_on_my_active_issues: 0,
    highest_interaction_issue_id: null,
    highest_interaction_label: null,
    highest_interaction_score: 0,
    received_damage_count: 0,
    received_false_report_count: 0,
    received_solved_count: 0,
    received_verification_count: 0,
    received_watcher_count: 0,
    watched_issue_count: watchedCount,
  };
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 1,
  }).format(value);
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
