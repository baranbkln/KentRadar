"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  Gauge,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { AnimatedScore } from "@/components/gamification/animated-score";
import type { AccountSummary } from "@/hooks/use-account-summary";
import { createOptionalClient } from "@/lib/supabase/browser";

type DailyQuestStatus = {
  target: number;
  current: number;
  isCompleted: boolean;
  bonusClaimed: boolean;
};

type CommandCenterHudProps = {
  accountSummary: AccountSummary;
  isLoading: boolean;
  onAccountRefresh: () => void;
};

export function CommandCenterHud({
  accountSummary,
  isLoading,
  onAccountRefresh,
}: CommandCenterHudProps) {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [quest, setQuest] = useState<DailyQuestStatus | null>(null);
  const [isQuestLoading, setIsQuestLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [questError, setQuestError] = useState<string | null>(null);

  const loadQuest = useCallback(async () => {
    if (!supabase) {
      setIsQuestLoading(false);
      return;
    }

    setIsQuestLoading(true);
    const { data, error } = await supabase.rpc("get_daily_quest_status");
    setIsQuestLoading(false);

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("get_daily_quest_status RPC error", error);
      }
      setQuestError("Günlük hedef yüklenemedi.");
      return;
    }

    setQuest(parseDailyQuestStatus(data));
    setQuestError(null);
  }, [supabase]);

  useEffect(() => {
    void loadQuest();
  }, [loadQuest]);

  async function handleClaimQuest() {
    if (!supabase || isClaiming) return;
    setIsClaiming(true);
    setQuestError(null);

    const { data, error } = await supabase.rpc("claim_daily_quest_bonus");
    setIsClaiming(false);

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("claim_daily_quest_bonus RPC error", error);
      }
      setQuestError(
        error.message.includes("daily_quest_not_completed")
          ? "Günlük hedef henüz tamamlanmadı."
          : "Katkı puanı alınamadı. Lütfen tekrar dene.",
      );
      return;
    }

    setQuest(parseDailyQuestStatus(data));
    onAccountRefresh();
  }

  return (
    <aside
      aria-label="Sivil Etki Paneli"
      className="pointer-events-auto absolute bottom-[58px] left-3 z-[630] w-[min(276px,calc(100%-24px))] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 text-slate-200 shadow-[0_18px_42px_rgba(15,23,42,0.22)] backdrop-blur-xl md:bottom-16 md:left-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-slate-400">
            <BarChart3 className="size-3.5" aria-hidden="true" />
            Sivil Etki Paneli
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-100">
            {accountSummary.username
              ? `@${accountSummary.username}`
              : "KentRadar katkıcısı"}
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-800/80 text-emerald-500">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <HudMetric
          icon={<Gauge className="size-3.5 text-blue-400" />}
          label="Katkı Puanı"
          value={
            isLoading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <AnimatedScore value={accountSummary.confirmedPoints} />
            )
          }
        />
        <HudMetric
          icon={<FileWarning className="size-3.5 text-blue-400" />}
          label="Bildirim"
          value={isLoading ? "..." : accountSummary.activeReportCount}
        />
        <HudMetric
          icon={<CheckCircle2 className="size-3.5 text-emerald-500" />}
          label="Çözüme Katkı"
          value={isLoading ? "..." : accountSummary.resolvedCount}
        />
        <HudMetric
          icon={<ClipboardCheck className="size-3.5 text-slate-300" />}
          label="Aktif Seri"
          value={isLoading ? "..." : `${accountSummary.currentStreakDays} gün`}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800/70 px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-slate-400">
          <ShieldCheck
            className={
              accountSummary.confirmedPoints >= 1000
                ? "size-3.5 text-emerald-500"
                : "size-3.5"
            }
            aria-hidden="true"
          />
          Güven düzeyi
        </span>
        <span
          className="truncate text-xs font-semibold text-slate-100"
          title={
            accountSummary.confirmedPoints >= 1000
              ? "Güvenilir Gözlemci"
              : accountSummary.levelLabel
          }
        >
          {accountSummary.confirmedPoints >= 1000
            ? "Güvenilir Gözlemci"
            : accountSummary.levelLabel}
        </span>
      </div>

      <section className="mt-2.5 rounded-xl border border-slate-700 bg-slate-800/55 px-2.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-slate-300">
            <ClipboardCheck className="size-3.5" aria-hidden="true" />
            Günlük Sivil Hedef
          </p>
          <span className="text-[10px] font-semibold text-slate-400">
            50 katkı puanı
          </span>
        </div>

        {isQuestLoading ? (
          <div className="mt-2 flex min-h-8 items-center gap-2 text-xs text-slate-400">
            <LoaderCircle className="size-3.5 animate-spin" />
            Hedef yükleniyor...
          </div>
        ) : quest ? (
          <>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-300">
                Hedef: Topluluğa {quest.target} katkı sağla
              </span>
              <span className="font-semibold tabular-nums text-slate-100">
                {quest.current}/{quest.target}
              </span>
            </div>
            <div
              aria-label={`Günlük sivil hedef ilerlemesi ${quest.current}/${quest.target}`}
              aria-valuemax={quest.target}
              aria-valuemin={0}
              aria-valuenow={quest.current}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, (quest.current / quest.target) * 100)}%`,
                }}
              />
            </div>

            {quest.bonusClaimed ? (
              <p className="mt-2 flex min-h-9 items-center gap-1.5 text-xs font-semibold text-emerald-500">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Günlük hedef tamamlandı
              </p>
            ) : quest.isCompleted ? (
              <button
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-900/35 px-3 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-900/55 disabled:opacity-60"
                disabled={isClaiming}
                onClick={() => void handleClaimQuest()}
                type="button"
              >
                {isClaiming ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {isClaiming ? "Kaydediliyor..." : "Katkı puanını al"}
              </button>
            ) : null}
          </>
        ) : null}

        {questError ? (
          <p className="mt-2 truncate text-[10px] font-semibold text-red-300">
            {questError}
          </p>
        ) : null}
      </section>
    </aside>
  );
}

function parseDailyQuestStatus(value: unknown): DailyQuestStatus | null {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== "object") return null;
  const row = record as Record<string, unknown>;
  const target = Number(row.target);
  const current = Number(row.current);

  if (!Number.isFinite(target) || !Number.isFinite(current) || target <= 0) {
    return null;
  }

  return {
    bonusClaimed: row.bonus_claimed === true,
    current: Math.max(0, Math.min(current, target)),
    isCompleted: row.is_completed === true,
    target,
  };
}

function HudMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-700 bg-slate-800/65 px-2.5 py-2">
      <div className="flex min-h-5 items-center gap-1.5 text-sm font-semibold tabular-nums text-slate-100">
        {icon}
        <span className="truncate">{value}</span>
      </div>
      <p className="mt-0.5 truncate text-[9px] font-semibold uppercase text-slate-400">
        {label}
      </p>
    </div>
  );
}
