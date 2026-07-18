"use client";

import L from "leaflet";
import { AlertTriangle } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { getUserRank, type UserRankTheme } from "@/utils/ranks";

type CreateRankIconOptions = {
  isSelected?: boolean;
};

const rankMarkerClasses: Record<UserRankTheme, string> = {
  bronze:
    "border-slate-300/70 bg-gradient-to-br from-slate-500 to-slate-800 text-white shadow-[0_8px_20px_rgba(51,65,85,0.38)]",
  silver:
    "border-cyan-200/80 bg-gradient-to-br from-cyan-400 to-blue-700 text-white shadow-[0_8px_22px_rgba(6,182,212,0.42)]",
  gold:
    "border-amber-200/90 bg-gradient-to-br from-amber-300 to-amber-700 text-white shadow-[0_8px_24px_rgba(245,158,11,0.48)]",
  emerald:
    "animate-pulse border-emerald-200/90 bg-gradient-to-br from-emerald-300 to-teal-700 text-white shadow-[0_0_26px_rgba(16,185,129,0.68)] motion-reduce:animate-none",
};

export function createRankIcon(
  score: number,
  { isSelected = false }: CreateRankIconOptions = {},
): L.DivIcon {
  const rank = getUserRank(score);
  const iconSvg = renderToStaticMarkup(
    <AlertTriangle
      aria-hidden="true"
      className="size-5"
      fill="currentColor"
      fillOpacity={0.16}
      strokeWidth={2.25}
    />,
  );
  const selectedClasses = isSelected
    ? "scale-110 ring-4 ring-white/80"
    : "scale-100 hover:scale-105";

  return L.divIcon({
    className: "rank-map-marker-icon bg-transparent border-0",
    html: `
      <div class="relative h-12 w-10 origin-bottom transition-transform duration-200 ${selectedClasses}" data-rank="${rank.theme}">
        <div class="absolute left-1/2 top-0 grid size-10 -translate-x-1/2 place-items-center rounded-[50%_50%_50%_12%] border-2 ${rankMarkerClasses[rank.theme]}" style="transform:translateX(-50%) rotate(-45deg)">
          <span class="grid place-items-center" style="transform:rotate(45deg)">${iconSvg}</span>
        </div>
        <span class="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-slate-950/35 blur-[1px]"></span>
      </div>
    `,
    iconAnchor: [20, 48],
    iconSize: [40, 48],
    popupAnchor: [0, -46],
  });
}
