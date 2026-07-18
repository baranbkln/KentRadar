"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  IssueRegionOption,
  LocalContributorRow,
  RegionalLeaderboardRow,
} from "@/lib/leaderboard/types";
import { createOptionalClient } from "@/lib/supabase/browser";

export function useIssueRegions() {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [regions, setRegions] = useState<IssueRegionOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let isActive = true;
    setIsLoading(true);

    void client
      .rpc("get_available_issue_regions")
      .then(({ data, error }) => {
        if (!isActive) return;
        setIsLoading(false);
        if (error) {
          if (process.env.NODE_ENV === "development") {
            console.warn("get_available_issue_regions RPC error", error);
          }
          setRegions([]);
          return;
        }
        setRegions(parseRegionOptions(data));
      });

    return () => {
      isActive = false;
    };
  }, [supabase]);

  return { isLoading, regions };
}

export function useRegionalLeaderboard(city: string, limit = 25) {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [rows, setRows] = useState<RegionalLeaderboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError("Bölge sıralaması için Supabase bağlantısı gerekli.");
      return;
    }

    const client = supabase;
    let isActive = true;
    setIsLoading(true);
    setError(null);

    void client
      .rpc("get_regional_leaderboard", {
        p_city: city || null,
        p_limit: limit,
        p_offset: 0,
      })
      .then(({ data, error: rpcError }) => {
        if (!isActive) return;
        setIsLoading(false);
        if (rpcError) {
          if (process.env.NODE_ENV === "development") {
            console.warn("get_regional_leaderboard RPC error", rpcError);
          }
          setRows([]);
          setError("Bölge sıralaması yüklenirken bir hata oluştu.");
          return;
        }
        setRows(parseRegionalRows(data));
      });

    return () => {
      isActive = false;
    };
  }, [city, limit, supabase]);

  return { error, isLoading, rows };
}

export function useLocalContributors(
  city: string,
  district: string,
  limit = 25,
) {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [rows, setRows] = useState<LocalContributorRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!city) {
      setRows([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    if (!supabase) {
      setError("Yerel sıralama için Supabase bağlantısı gerekli.");
      return;
    }

    const client = supabase;
    let isActive = true;
    setIsLoading(true);
    setError(null);

    void client
      .rpc("get_local_contributors", {
        p_city: city,
        p_district: district || null,
        p_limit: limit,
        p_offset: 0,
      })
      .then(({ data, error: rpcError }) => {
        if (!isActive) return;
        setIsLoading(false);
        if (rpcError) {
          if (process.env.NODE_ENV === "development") {
            console.warn("get_local_contributors RPC error", rpcError);
          }
          setRows([]);
          setError("Yerel katkıcı sıralaması yüklenirken bir hata oluştu.");
          return;
        }
        setRows(parseLocalContributorRows(data));
      });

    return () => {
      isActive = false;
    };
  }, [city, district, limit, supabase]);

  return { error, isLoading, rows };
}

function parseRegionOptions(value: unknown): IssueRegionOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.city !== "string") return [];
    return [{
      city: row.city,
      district: typeof row.district === "string" ? row.district : null,
    }];
  });
}

function parseRegionalRows(value: unknown): RegionalLeaderboardRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.city !== "string" || typeof row.district !== "string") {
      return [];
    }
    return [{
      city: row.city,
      district: row.district,
      rank: numberField(row.rank),
      total_issues: numberField(row.total_issues),
      total_reports: numberField(row.total_reports),
      total_resolved: numberField(row.total_resolved),
      total_verified: numberField(row.total_verified),
    }];
  });
}

function parseLocalContributorRows(value: unknown): LocalContributorRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.public_display_name !== "string" ||
      typeof row.level_label !== "string" ||
      typeof row.city !== "string"
    ) {
      return [];
    }
    return [{
      avatar_style:
        typeof row.avatar_style === "string" ? row.avatar_style : "cyan_user",
      city: row.city,
      district: typeof row.district === "string" ? row.district : null,
      is_current_user: row.is_current_user === true,
      level_label: row.level_label,
      period: "all_time",
      points: numberField(row.points),
      public_display_name: row.public_display_name,
      rank: numberField(row.rank),
      user_public_code:
        typeof row.user_public_code === "string" ? row.user_public_code : null,
      username: typeof row.username === "string" ? row.username : null,
    }];
  });
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
