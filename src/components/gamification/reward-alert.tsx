"use client";

import { useEffect } from "react";
import { Snowflake, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DynamicRewardBonus } from "@/lib/road-issues/types";

type RewardAlertProps = {
  bonus: DynamicRewardBonus;
  finalScore?: number | null;
  onDismiss: () => void;
};

const rewardContent: Record<
  DynamicRewardBonus,
  { title: string; description: string }
> = {
  CRITICAL_HIT: {
    title: "Kritik Doğrulama!",
    description: "3x Puan Çarpanı!",
  },
  COLD_CASE: {
    title: "Soğuk Dava Çözüldü!",
    description: "2x Puan Bonus!",
  },
};

export function RewardAlert({
  bonus,
  finalScore,
  onDismiss,
}: RewardAlertProps) {
  const content = rewardContent[bonus];
  const isCritical = bonus === "CRITICAL_HIT";

  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 5_000);
    return () => window.clearTimeout(timeout);
  }, [bonus, onDismiss]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(96px,calc(env(safe-area-inset-top)+84px))] z-[1900] flex justify-center px-4"
    >
      <div
        role="status"
        className={cn(
          "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl motion-safe:animate-pulse",
          isCritical
            ? "border-yellow-300/60 bg-yellow-300/90 text-yellow-950 shadow-yellow-400/25"
            : "border-cyan-200/50 bg-slate-900/92 text-cyan-50 shadow-cyan-400/20",
        )}
      >
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full",
            isCritical ? "bg-yellow-950/10" : "bg-cyan-300/10",
          )}
        >
          {isCritical ? (
            <Sparkles className="size-6" aria-hidden="true" />
          ) : (
            <Snowflake className="size-6" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{content.title}</p>
          <p className="text-sm font-semibold opacity-85">
            {content.description}
            {typeof finalScore === "number" ? ` · ${finalScore} puan` : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="Ödül bildirimini kapat"
          onClick={onDismiss}
          className="grid size-11 shrink-0 place-items-center rounded-full transition hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
