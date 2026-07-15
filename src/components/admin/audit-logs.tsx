"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, ScrollText } from "lucide-react";
import type {
  AdminAuditLog,
  AdminProfileSummary,
} from "@/components/admin/types";
import { createOptionalClient } from "@/lib/supabase/browser";

const PAGE_SIZE = 30;

const actionLabels: Record<string, string> = {
  hide_issue: "Sorun gizlendi",
  resolve_issue: "Sorun çözüldü olarak işaretlendi",
  reject_issue: "Sorun reddedildi",
  suspend_user: "Kullanıcı askıya alındı",
};

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async (offset = 0, append = false) => {
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
    const { data, error: logsError } = await supabase
      .from("admin_audit_logs")
      .select("id, admin_id, action_type, target_id, reason, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (logsError) {
      if (process.env.NODE_ENV === "development") {
        console.error("admin_audit_logs query error", logsError);
      }
      setError("İşlem kayıtları yüklenirken bir hata oluştu.");
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const rawLogs = (data ?? []) as Omit<AdminAuditLog, "admin">[];
    const adminIds = [...new Set(rawLogs.map((log) => log.admin_id))];
    let adminMap = new Map<string, AdminProfileSummary>();

    if (adminIds.length > 0) {
      const { data: admins, error: adminsError } = await supabase
        .from("profiles")
        .select("id, email, display_name")
        .in("id", adminIds);

      if (adminsError && process.env.NODE_ENV === "development") {
        console.warn("admin audit profile query error", adminsError);
      }

      adminMap = new Map(
        ((admins ?? []) as AdminProfileSummary[]).map((admin) => [
          admin.id,
          admin,
        ]),
      );
    }

    const nextLogs = rawLogs.map((log) => ({
      ...log,
      admin: adminMap.get(log.admin_id) ?? null,
    }));

    setLogs((current) => (append ? [...current, ...nextLogs] : nextLogs));
    setHasMore(nextLogs.length === PAGE_SIZE);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">İşlem Kayıtları</h1>
          <p className="mt-1 text-sm text-slate-400">
            Yönetici moderasyon işlemlerinin değiştirilemeyen kronolojik kaydı.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadLogs()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Yenile
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid min-h-64 place-items-center text-sm text-slate-400">
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            İşlem kayıtları yükleniyor...
          </span>
        </div>
      ) : logs.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center text-sm text-slate-400">
          Henüz yönetici işlem kaydı yok.
        </div>
      ) : (
        <ol className="space-y-3">
          {logs.map((log) => {
            const adminLabel =
              log.admin?.display_name ||
              log.admin?.email ||
              shortId(log.admin_id);

            return (
              <li key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-400/10 text-violet-200">
                      <ScrollText className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-white">
                        {actionLabels[log.action_type] ?? log.action_type}
                      </p>
                      <p className="mt-1 text-sm text-slate-300">{log.reason}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>Yönetici: {adminLabel}</span>
                        <span title={log.target_id}>Hedef: {shortId(log.target_id)}</span>
                      </div>
                    </div>
                  </div>
                  <time className="shrink-0 text-xs text-slate-500" dateTime={log.created_at}>
                    {formatDate(log.created_at)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {hasMore ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadLogs(logs.length, true)}
          className="mx-auto flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
        >
          {loadingMore ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          Daha fazla göster
        </button>
      ) : null}
    </div>
  );
}
