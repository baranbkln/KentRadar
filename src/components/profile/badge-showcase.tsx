"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CircleCheck,
  LoaderCircle,
  MapPinCheck,
  ShieldCheck,
} from "lucide-react";
import { createOptionalClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export type CivicBadge = {
  badgeId: string;
  name: string;
  description: string;
  iconName: string;
  colorTheme: "slate" | "blue" | "emerald";
  requirementValue: number;
  awardedAt: string;
};

const themeClasses: Record<CivicBadge["colorTheme"], string> = {
  blue: "border-blue-200 bg-blue-50/80 text-blue-700",
  emerald: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
  slate: "border-slate-200 bg-slate-100/85 text-slate-700",
};

export function BadgeShowcase() {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [badges, setBadges] = useState<CivicBadge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      setError("Rozet bilgileri için Supabase bağlantısı gerekli.");
      return;
    }

    const client = supabase;
    let isActive = true;

    async function loadBadges() {
      setIsLoading(true);
      const { data, error: rpcError } = await client.rpc("get_my_badges");

      if (!isActive) return;
      setIsLoading(false);

      if (rpcError) {
        if (process.env.NODE_ENV === "development") {
          console.warn("get_my_badges RPC error", rpcError);
        }
        setBadges([]);
        setError("Sivil rozetler yüklenemedi.");
        return;
      }

      setBadges(parseCivicBadges(data));
      setError(null);
    }

    void loadBadges();
    return () => {
      isActive = false;
    };
  }, [supabase]);

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white/58 p-4">
      <div>
        <p className="text-xs font-semibold uppercase text-ink-subtle">
          Sivil katkı rozetleri
        </p>
        <h2 className="mt-1 text-lg font-semibold text-ink">Rozetlerin</h2>
        <p className="mt-1 text-sm leading-6 text-ink-muted">
          Doğrulanabilir katkıların sonucunda kazandığın işaretler.
        </p>
      </div>

      {isLoading ? (
        <p className="mt-3 flex min-h-11 items-center gap-2 text-sm text-ink-muted">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Rozetler yükleniyor...
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      {!isLoading && !error && badges.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-ink-muted">
          Katkı sağladıkça kazandığın sivil rozetler burada görünecek.
        </p>
      ) : null}

      {badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((badge) => (
            <BadgeToken badge={badge} key={badge.badgeId} showLabel />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function BadgeToken({
  badge,
  className,
  showLabel = false,
}: {
  badge: CivicBadge;
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <span
      className={cn(
        "group relative inline-flex min-h-11 items-center gap-2 rounded-full border px-2.5",
        themeClasses[badge.colorTheme],
        className,
      )}
      title={`${badge.name}: ${badge.description}`}
    >
      <BadgeGlyph iconName={badge.iconName} />
      {showLabel ? (
        <span className="pr-1 text-xs font-semibold">{badge.name}</span>
      ) : null}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-56 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-center text-xs font-medium leading-5 text-slate-200 shadow-xl group-hover:block group-focus-within:block"
        role="tooltip"
      >
        <strong className="block font-semibold text-white">{badge.name}</strong>
        {badge.description}
      </span>
    </span>
  );
}

function BadgeGlyph({ iconName }: { iconName: string }) {
  const className = "size-4 shrink-0";

  if (iconName === "map-pin-check") {
    return <MapPinCheck className={className} aria-hidden="true" />;
  }
  if (iconName === "badge-check") {
    return <BadgeCheck className={className} aria-hidden="true" />;
  }
  if (iconName === "shield-check") {
    return <ShieldCheck className={className} aria-hidden="true" />;
  }
  return <CircleCheck className={className} aria-hidden="true" />;
}

export function parseCivicBadges(value: unknown): CivicBadge[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;

    if (
      typeof row.badge_id !== "string" ||
      typeof row.name !== "string" ||
      typeof row.description !== "string" ||
      typeof row.icon_name !== "string" ||
      typeof row.awarded_at !== "string"
    ) {
      return [];
    }

    const colorTheme =
      row.color_theme === "blue" || row.color_theme === "emerald"
        ? row.color_theme
        : "slate";

    return [
      {
        awardedAt: row.awarded_at,
        badgeId: row.badge_id,
        colorTheme,
        description: row.description,
        iconName: row.icon_name,
        name: row.name,
        requirementValue: numberField(row.requirement_value),
      },
    ];
  });
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
