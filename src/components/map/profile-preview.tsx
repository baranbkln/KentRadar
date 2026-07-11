"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, LogOut, X } from "lucide-react";
import { GlassPanel } from "@/components/map/glass-panel";
import { createOptionalClient } from "@/lib/supabase/browser";
import type { ProfileSummary } from "@/lib/road-issues/types";

type ProfilePreviewProps = {
  userEmail: string | null;
  onClose: () => void;
  onSignOut: () => void;
};

const emptySummary: ProfileSummary = {
  active_report_count: 0,
  damage_report_count: 0,
  false_report_count: 0,
  solved_report_count: 0,
  verification_count: 0,
  withdrawn_report_count: 0,
};

export function ProfilePreview({
  userEmail,
  onClose,
  onSignOut,
}: ProfilePreviewProps) {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [summary, setSummary] = useState<ProfileSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSummary() {
      if (!supabase) {
        setIsLoading(false);
        setError("Profil bilgileri için Supabase bağlantısı gerekli.");
        return;
      }

      setIsLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc(
        "get_my_profile_summary",
      );

      if (!isMounted) {
        return;
      }

      if (rpcError) {
        if (process.env.NODE_ENV === "development") {
          console.error("get_my_profile_summary RPC error", rpcError);
        }

        setError("Profil özeti yüklenemedi.");
        setIsLoading(false);
        return;
      }

      setSummary(parseSummary(data));
      setIsLoading(false);
    }

    void loadSummary();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

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
              <h2 className="text-base font-semibold text-ink">Profilim</h2>
              <p className="mt-1 truncate text-sm text-ink-muted">
                {userEmail ?? "Hesap bilgileri"}
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
            Profil özeti yükleniyor...
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50/80 px-3 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        {!isLoading && !error ? (
          <div className="grid grid-cols-2 gap-2">
            <SummaryMetric
              label="Aktif bildirim"
              value={summary.active_report_count}
            />
            <SummaryMetric
              label="Geri çekilen"
              value={summary.withdrawn_report_count}
            />
            <SummaryMetric
              label="Hasar bildirimi"
              value={summary.damage_report_count}
            />
            <SummaryMetric
              label="Doğrulama"
              value={summary.verification_count}
            />
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
            href="/profile"
          >
            Profil sayfasına git
            <ExternalLink className="size-4" />
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

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
