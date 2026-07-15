"use client";

import { Award, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserRank, type UserRankTheme } from "@/utils/ranks";

const rankThemeClasses: Record<UserRankTheme, string> = {
  bronze: "border-amber-700/25 bg-amber-100/75 text-amber-900",
  silver: "border-slate-300 bg-slate-100/85 text-slate-700",
  gold: "border-yellow-500/35 bg-yellow-100/80 text-yellow-900",
  emerald: "border-emerald-500/30 bg-emerald-100/80 text-emerald-800",
};

type UserRankBadgeProps = {
  score: number;
  compact?: boolean;
  className?: string;
  showInfo?: boolean;
};

export function UserRankBadge({
  score,
  compact = false,
  className,
  showInfo = true,
}: UserRankBadgeProps) {
  const rank = getUserRank(score);

  return (
    <span className={cn("group relative inline-flex items-center", className)}>
      <span
        className={cn(
          "inline-flex min-h-7 items-center gap-1.5 rounded-full border font-semibold",
          compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs",
          rankThemeClasses[rank.theme],
        )}
      >
        <Award className={compact ? "size-3" : "size-3.5"} aria-hidden="true" />
        {rank.title}
      </span>
      {showInfo ? (
        <>
          <button
            type="button"
            aria-label="Rütbe sistemi hakkında bilgi"
            className="ml-1 grid size-7 place-items-center rounded-full text-ink-muted transition hover:bg-white/80 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-road-blue"
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-950/95 px-3 py-2 text-center text-xs font-medium leading-5 text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Puan kazandıkça rütbeniz ve doğrulamalarınızın etki katsayısı artar!
          </span>
        </>
      ) : null}
    </span>
  );
}
