"use client";

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
          ? "border-orange-400/35 bg-orange-100/85 text-orange-800 shadow-[0_0_14px_rgba(249,115,22,0.18)]"
          : "border-slate-200 bg-white/70 text-ink-muted",
        className,
      )}
      title={`En uzun seri: ${longest} gün`}
    >
      {isActive ? <span aria-hidden="true">🔥</span> : null}
      {isActive ? `${current} Günlük Seri!` : "Seri başlamadı"}
    </span>
  );
}
