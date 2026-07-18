"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { createOptionalClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type TickerTone = "critical" | "cold" | "quest" | "report" | "verify";

type TickerItem = {
  id: string;
  message: string;
  tone: TickerTone;
};

const toneClasses: Record<TickerTone, string> = {
  cold: "border-slate-700 text-slate-200",
  critical: "border-blue-800 text-slate-200",
  quest: "border-emerald-800 text-slate-200",
  report: "border-slate-700 text-slate-200",
  verify: "border-emerald-800 text-slate-200",
};

export function LiveTicker() {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("public:user_score_events")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "public_score_activity_events",
        },
        (payload) => {
          const item = toTickerItem(payload.new);
          if (!item) return;

          setItems((current) => [item, ...current].slice(0, 3));
          window.setTimeout(() => {
            setItems((current) =>
              current.filter((candidate) => candidate.id !== item.id),
            );
          }, 7000);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (items.length === 0) return null;

  return (
    <aside
      aria-label="Canlı topluluk aktiviteleri"
      aria-live="polite"
      className="pointer-events-none absolute bottom-[410px] left-3 z-[620] flex w-[calc(100%-24px)] flex-col gap-2 md:bottom-5 md:left-[300px] md:w-[min(320px,calc(100%-324px))]"
    >
      {items.map((item, index) => (
        <div
          className={cn(
            "live-ticker-item flex min-h-11 items-center gap-2.5 rounded-xl border bg-slate-900/80 px-3.5 py-2 text-xs font-medium shadow-[0_12px_28px_rgba(15,23,42,0.2)] backdrop-blur-xl",
            index > 0 && "hidden md:flex",
            toneClasses[item.tone],
          )}
          key={item.id}
        >
          <TickerIcon tone={item.tone} />
          <span className="min-w-0 truncate">{item.message}</span>
        </div>
      ))}
    </aside>
  );
}

function TickerIcon({ tone }: { tone: TickerTone }) {
  if (tone === "critical") {
    return <ShieldCheck className="size-4 shrink-0 text-blue-400" aria-hidden="true" />;
  }
  if (tone === "cold") {
    return <Clock3 className="size-4 shrink-0 text-slate-400" aria-hidden="true" />;
  }
  if (tone === "quest") {
    return <Activity className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />;
  }
  if (tone === "report") {
    return <MapPin className="size-4 shrink-0 text-blue-400" aria-hidden="true" />;
  }
  return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />;
}

function toTickerItem(value: unknown): TickerItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const eventType = typeof row.event_type === "string" ? row.event_type : "";
  const bonusType = typeof row.bonus_type === "string" ? row.bonus_type : null;
  const rawId = typeof row.id === "string" ? row.id : crypto.randomUUID();

  if (bonusType === "CRITICAL_HIT") {
    return {
      id: rawId,
      message: "Yeni bir altyapı sorunu doğrulandı.",
      tone: "critical",
    };
  }
  if (bonusType === "COLD_CASE") {
    return {
      id: rawId,
      message: "Uzun süredir açık bir sorun yeniden değerlendirildi.",
      tone: "cold",
    };
  }
  if (bonusType === "DAILY_QUEST" || eventType === "daily_quest_bonus") {
    return {
      id: rawId,
      message: "Bir kullanıcı günlük sivil hedefini tamamladı.",
      tone: "quest",
    };
  }
  if (eventType === "issue_report_created") {
    return {
      id: rawId,
      message: "Haritaya yeni bir yol sorunu eklendi.",
      tone: "report",
    };
  }
  if (eventType === "issue_verified_by_user") {
    return {
      id: rawId,
      message: "Bir yol sorunu yerinde doğrulandı.",
      tone: "verify",
    };
  }

  return null;
}
