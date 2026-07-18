"use client";

import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type StreakBadgeProps = {
  currentStreak: number;
  longestStreak: number;
  className?: string;
};

export function StreakBadge({
  currentStreak,
  longestStreak,
  className,
}: StreakBadgeProps) {
  const current = Math.max(0, Math.round(currentStreak));
  const longest = Math.max(current, Math.round(longestStreak));
  const isActive = current > 0;

  return (
    <span
      aria-label={
        isActive
          ? `${current} günlük seri. En uzun seri ${longest} gün.`
          : `Aktif seri yok. En uzun seri ${longest} gün.`
      }
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        isActive
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-white/70 text-ink-muted",
        className,
      )}
      title={`En uzun seri: ${longest} gün`}
    >
      <Activity className="size-3.5" aria-hidden="true" />
      {isActive ? `${current} gün aktif katkı` : "Aktif katkı serisi yok"}
    </span>
  );
}
