"use client";

import { useEffect } from "react";
import { CheckCircle2, Clock3, X } from "lucide-react";
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
    title: "Ek katkı puanı",
    description: "Doğrulama katkın için ek puan kaydedildi.",
  },
  COLD_CASE: {
    title: "Uzun süredir açık sorun katkısı",
    description: "Eski bir sorunun güncellenmesine katkı sağladın.",
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
          "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border bg-slate-900/90 px-4 py-3 text-slate-200 shadow-[0_16px_36px_rgba(15,23,42,0.24)] backdrop-blur-xl",
          isCritical
            ? "border-emerald-800"
            : "border-slate-700",
        )}
      >
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full",
            isCritical
              ? "bg-emerald-900/40 text-emerald-500"
              : "bg-slate-800 text-blue-400",
          )}
        >
          {isCritical ? (
            <CheckCircle2 className="size-6" aria-hidden="true" />
          ) : (
            <Clock3 className="size-6" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{content.title}</p>
          <p className="text-sm text-slate-400">
            {content.description}
            {typeof finalScore === "number" ? ` · ${finalScore} puan` : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="Katkı bildirimini kapat"
          onClick={onDismiss}
          className="grid size-11 shrink-0 place-items-center rounded-full transition hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
