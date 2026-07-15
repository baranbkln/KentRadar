"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  EyeOff,
  LoaderCircle,
  RefreshCw,
  ShieldX,
} from "lucide-react";
import { ModerationReasonDialog } from "@/components/admin/moderation-reason-dialog";
import type {
  AdminIssueAction,
  AdminProfileSummary,
  ModerationIssue,
} from "@/components/admin/types";
import {
  categoryLabels,
  severityLabels,
  statusLabels,
} from "@/lib/domain/road-issue-options";
import { createOptionalClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const actionCopy: Record<
  AdminIssueAction,
  { title: string; description: string; confirm: string }
> = {
  hide: {
    title: "Sorunu gizle",
    description: "Bu sorun kamuya açık listelerden ve haritadan gizlenecek.",
    confirm: "Gizle",
  },
  resolve: {
    title: "Sorunu çözüldü olarak işaretle",
    description: "Sorunun durumu yönetici kararıyla çözüldü olarak güncellenecek.",
    confirm: "Çözüldü olarak işaretle",
  },
  reject: {
    title: "Sorunu reddet",
    description: "Sorun tartışmalı duruma alınacak ve kamu görünümünden gizlenecek.",
    confirm: "Reddet",
  },
};

type DialogState = {
  issue: ModerationIssue;
  action: AdminIssueAction;
} | null;

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function IssueModeration() {
  const [issues, setIssues] = useState<ModerationIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadIssues = useCallback(async (offset = 0, append = false) => {
    const supabase = createOptionalClient();
    if (!supabase) {
      setError("Supabase bağlantısı kurulamadı.");
      setLoading(false);
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const { data, error: issuesError } = await supabase
      .from("road_issues")
      .select(
        "id, category, severity, status, created_by, reporter_count, verification_count, damage_count, created_at, is_hidden",
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (issuesError) {
      if (process.env.NODE_ENV === "development") {
        console.error("admin road_issues query error", issuesError);
      }
      setError("Yol sorunları yüklenirken bir hata oluştu.");
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const rawIssues = (data ?? []) as Omit<ModerationIssue, "reporter">[];
    const reporterIds = [...new Set(rawIssues.map((issue) => issue.created_by))];
    let profileMap = new Map<string, AdminProfileSummary>();

    if (reporterIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, display_name")
        .in("id", reporterIds);

      if (profilesError && process.env.NODE_ENV === "development") {
        console.warn("admin issue reporter profiles query error", profilesError);
      }

      profileMap = new Map(
        ((profiles ?? []) as AdminProfileSummary[]).map((profile) => [
          profile.id,
          profile,
        ]),
      );
    }

    const nextIssues = rawIssues.map((issue) => ({
      ...issue,
      reporter: profileMap.get(issue.created_by) ?? null,
    }));

    setIssues((current) => (append ? [...current, ...nextIssues] : nextIssues));
    setHasMore(nextIssues.length === PAGE_SIZE);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const handleModerate = async (reason: string) => {
    if (!dialog) return;
    const supabase = createOptionalClient();
    if (!supabase) {
      setActionError("Supabase bağlantısı kurulamadı.");
      return;
    }

    setSubmitting(true);
    setActionError(null);
    const { data, error: rpcError } = await supabase.rpc(
      "admin_moderate_issue",
      {
        p_issue_id: dialog.issue.id,
        p_action: dialog.action,
        p_reason: reason,
      },
    );

    if (rpcError) {
      if (process.env.NODE_ENV === "development") {
        console.error("admin_moderate_issue RPC error", rpcError);
      }
      setActionError("Moderasyon işlemi tamamlanamadı.");
      setSubmitting(false);
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    setIssues((current) =>
      current.map((issue) =>
        issue.id === dialog.issue.id
          ? {
              ...issue,
              status: result?.status ?? issue.status,
              is_hidden: result?.is_hidden ?? issue.is_hidden,
            }
          : issue,
      ),
    );
    setFeedback("Moderasyon işlemi kaydedildi.");
    setDialog(null);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center text-sm text-slate-400">
        <span className="inline-flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Yol sorunları yükleniyor...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Sorun Moderasyonu</h1>
          <p className="mt-1 text-sm text-slate-400">
            Son yol sorunlarını inceleyin ve kayıtlı gerekçeyle işlem yapın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadIssues()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Yenile
        </button>
      </div>

      {feedback ? (
        <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {issues.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center text-sm text-slate-400">
          İncelenecek yol sorunu bulunmuyor.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {issues.map((issue) => {
            const reporterLabel =
              issue.reporter?.display_name ||
              issue.reporter?.email ||
              shortId(issue.created_by);

            return (
              <article
                key={issue.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg shadow-black/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-cyan-200 ring-1 ring-inset ring-cyan-300/20">
                        {categoryLabels[issue.category]}
                      </span>
                      <span className="rounded-full bg-white/5 px-2.5 py-1 text-slate-300 ring-1 ring-inset ring-white/10">
                        {severityLabels[issue.severity]}
                      </span>
                      <span className="rounded-full bg-white/5 px-2.5 py-1 text-slate-300 ring-1 ring-inset ring-white/10">
                        {statusLabels[issue.status]}
                      </span>
                    </div>
                    <p className="mt-3 truncate text-sm font-medium text-slate-100">
                      Bildiren: {reporterLabel}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(issue.created_at)} · {shortId(issue.id)}
                    </p>
                  </div>
                  {issue.is_hidden ? (
                    <span className="shrink-0 rounded-full bg-rose-400/10 px-2.5 py-1 text-xs font-semibold text-rose-200">
                      Gizli
                    </span>
                  ) : null}
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["Bildiren", issue.reporter_count],
                    ["Doğrulama", issue.verification_count],
                    ["Hasar", issue.damage_count],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-950/45 px-2 py-2 text-center">
                      <dt className="text-[11px] text-slate-500">{label}</dt>
                      <dd className="mt-0.5 text-base font-bold text-white">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <ActionButton
                    label="Gizle"
                    icon={EyeOff}
                    disabled={issue.is_hidden}
                    onClick={() => setDialog({ issue, action: "hide" })}
                  />
                  <ActionButton
                    label="Çözüldü"
                    icon={CheckCircle2}
                    tone="success"
                    onClick={() => setDialog({ issue, action: "resolve" })}
                  />
                  <ActionButton
                    label="Reddet"
                    icon={ShieldX}
                    tone="danger"
                    onClick={() => setDialog({ issue, action: "reject" })}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hasMore ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadIssues(issues.length, true)}
          className="mx-auto flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
        >
          {loadingMore ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          Daha fazla göster
        </button>
      ) : null}

      <ModerationReasonDialog
        open={dialog !== null}
        title={dialog ? actionCopy[dialog.action].title : ""}
        description={dialog ? actionCopy[dialog.action].description : ""}
        confirmLabel={dialog ? actionCopy[dialog.action].confirm : "Onayla"}
        tone={dialog?.action === "resolve" ? "primary" : "danger"}
        loading={submitting}
        error={actionError}
        onClose={() => {
          if (!submitting) {
            setDialog(null);
            setActionError(null);
          }
        }}
        onConfirm={handleModerate}
      />
    </div>
  );
}

type ActionButtonProps = {
  label: string;
  icon: typeof EyeOff;
  tone?: "default" | "success" | "danger";
  disabled?: boolean;
  onClick: () => void;
};

function ActionButton({
  label,
  icon: Icon,
  tone = "default",
  disabled,
  onClick,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-35",
        tone === "default" && "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
        tone === "success" && "border-emerald-300/20 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15",
        tone === "danger" && "border-rose-300/20 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
