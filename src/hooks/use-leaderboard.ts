"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type LeaderboardPeriod,
  type LeaderboardRow,
} from "@/lib/leaderboard/types";
import { createOptionalClient } from "@/lib/supabase/browser";

export function useLeaderboard(period: LeaderboardPeriod, limit = 25) {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadLeaderboard() {
      if (!supabase) {
        setRows([]);
        setError("Sıralama için Supabase bağlantısı yapılandırılmalı.");
        return;
      }

      setIsLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc(
        "get_public_leaderboard",
        {
          p_limit: limit,
          p_period: period,
        },
      );

      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (rpcError) {
        if (process.env.NODE_ENV === "development") {
          console.error("get_public_leaderboard RPC error", rpcError);
        }

        setRows([]);
        setError("Katkıcı sıralaması yüklenirken bir hata oluştu.");
        return;
      }

      setRows(parseLeaderboardRows(data));
    }

    void loadLeaderboard();

    return () => {
      isMounted = false;
    };
  }, [limit, period, supabase]);

  return { error, isLoading, rows };
}

function parseLeaderboardRows(value: unknown): LeaderboardRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;

    if (
      typeof record.public_display_name !== "string" ||
      typeof record.level_label !== "string" ||
      typeof record.period !== "string"
    ) {
      return [];
    }

    return [
      {
        is_current_user:
          typeof record.is_current_user === "boolean"
            ? record.is_current_user
            : false,
        level_label: record.level_label,
        period: record.period as LeaderboardRow["period"],
        points: numberField(record.points),
        public_display_name: record.public_display_name,
        rank: numberField(record.rank),
        user_public_code:
          typeof record.user_public_code === "string"
            ? record.user_public_code
            : null,
        username:
          typeof record.username === "string" ? record.username : null,
        avatar_style:
          typeof record.avatar_style === "string"
            ? record.avatar_style
            : "cyan_user",
      },
    ];
  });
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
