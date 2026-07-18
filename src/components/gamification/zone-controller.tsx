"use client";

import { Activity, BadgeCheck, MapPinned } from "lucide-react";
import { PlayerAvatar } from "@/components/profile/player-avatar";
import { cn } from "@/lib/utils";

export type ZoneControllerProps = {
  districtName: string;
  topPlayerName: string;
  playerRank: string;
  playerScore: number;
  streakDays: number;
  avatarStyle?: string | null;
  className?: string;
};

export function ZoneController({
  districtName,
  topPlayerName,
  playerRank,
  playerScore,
  streakDays,
  avatarStyle,
  className = "",
}: ZoneControllerProps) {
  return (
    <aside
      aria-label={`${districtName} katkı özeti`}
      className={cn(
        "pointer-events-auto absolute left-3 top-[204px] z-[640] w-[min(248px,calc(100%-24px))] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 text-slate-200 shadow-[0_18px_42px_rgba(15,23,42,0.22)] backdrop-blur-xl md:left-5 md:top-[164px] lg:top-28",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-800 text-blue-400">
          <MapPinned className="size-5" strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-slate-400">
            <Activity className="size-3" aria-hidden="true" />
            Bölge katkı özeti
          </p>
          <h2 className="mt-0.5 truncate text-sm font-semibold text-slate-100">
            {districtName}
          </h2>
        </div>
      </div>

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <PlayerAvatar
              avatarStyle={avatarStyle}
              className="size-9 border-white/20 bg-white/10"
              iconClassName="size-4"
              label={`${topPlayerName} avatarı`}
            />
            <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">
              {topPlayerName}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-300">
              <BadgeCheck className="size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
              <span className="truncate">{playerRank}</span>
            </p>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-base font-semibold tabular-nums text-slate-100">
              {playerScore.toLocaleString("tr-TR")}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Katkı puanı
            </p>
          </div>
        </div>

        {streakDays > 0 ? (
          <div className="mt-3 inline-flex min-h-8 items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-2.5 text-xs font-medium text-slate-300">
            <Activity className="size-4 text-emerald-500" aria-hidden="true" />
            {streakDays} günlük düzenli katkı
          </div>
        ) : null}
      </div>
    </aside>
  );
}
