"use client";

import type { LucideIcon } from "lucide-react";
import { Compass, Shield, User, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export type AvatarStyle =
  | "cyan_user"
  | "amber_shield"
  | "emerald_compass"
  | "slate_wrench";

export type PlayerAvatarOption = {
  value: AvatarStyle;
  label: string;
  Icon: LucideIcon;
  className: string;
};

export const playerAvatarOptions: readonly PlayerAvatarOption[] = [
  {
    value: "cyan_user",
    label: "Gözlemci",
    Icon: User,
    className:
      "border-cyan-300/45 bg-gradient-to-br from-cyan-400/25 to-blue-600/20 text-cyan-700 shadow-[0_0_20px_rgba(6,182,212,0.16)]",
  },
  {
    value: "amber_shield",
    label: "Koruyucu",
    Icon: Shield,
    className:
      "border-amber-300/55 bg-gradient-to-br from-amber-300/28 to-orange-600/18 text-amber-700 shadow-[0_0_20px_rgba(245,158,11,0.16)]",
  },
  {
    value: "emerald_compass",
    label: "Kâşif",
    Icon: Compass,
    className:
      "border-emerald-300/50 bg-gradient-to-br from-emerald-300/25 to-teal-700/18 text-emerald-700 shadow-[0_0_20px_rgba(16,185,129,0.16)]",
  },
  {
    value: "slate_wrench",
    label: "Usta",
    Icon: Wrench,
    className:
      "border-slate-300/70 bg-gradient-to-br from-slate-200/70 to-slate-500/22 text-slate-700 shadow-[0_0_18px_rgba(71,85,105,0.14)]",
  },
] as const;

type PlayerAvatarProps = {
  avatarStyle: AvatarStyle | string | null | undefined;
  className?: string;
  iconClassName?: string;
  label?: string;
};

export function PlayerAvatar({
  avatarStyle,
  className,
  iconClassName,
  label = "Oyuncu avatarı",
}: PlayerAvatarProps) {
  const option = getPlayerAvatarOption(avatarStyle);
  const { Icon } = option;

  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-md",
        option.className,
        className,
      )}
      role="img"
    >
      <Icon className={cn("size-5", iconClassName)} aria-hidden="true" />
    </span>
  );
}

export function getPlayerAvatarOption(
  avatarStyle: string | null | undefined,
) {
  return (
    playerAvatarOptions.find((option) => option.value === avatarStyle) ??
    playerAvatarOptions[0]
  );
}
