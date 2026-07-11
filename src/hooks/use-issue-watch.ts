"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IssueWatchState } from "@/lib/road-issues/types";
import { createOptionalClient } from "@/lib/supabase/browser";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "unconfigured";

type UseIssueWatchResult = {
  authStatus: AuthStatus;
  error: string | null;
  isLoading: boolean;
  isWatching: boolean;
  watcherCount: number | null;
  follow: () => Promise<IssueWatchState | null>;
  refresh: () => Promise<IssueWatchState | null>;
  toggleWatch: () => Promise<IssueWatchState | null>;
  unfollow: () => Promise<IssueWatchState | null>;
};

export function useIssueWatch(
  issueId: string,
  initialWatcherCount?: number | null,
): UseIssueWatchResult {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    supabase ? "loading" : "unconfigured",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [watcherCount, setWatcherCount] = useState<number | null>(
    initialWatcherCount ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof initialWatcherCount === "number") {
      setWatcherCount(initialWatcherCount);
    }
  }, [initialWatcherCount]);

  useEffect(() => {
    if (!supabase) {
      setAuthStatus("unconfigured");
      return;
    }

    const client = supabase;
    let isMounted = true;

    async function loadSession() {
      const { data } = await client.auth.getSession();

      if (!isMounted) {
        return;
      }

      setAuthStatus(data.session ? "authenticated" : "unauthenticated");
    }

    void loadSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setAuthStatus(session ? "authenticated" : "unauthenticated");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const applyState = useCallback((state: IssueWatchState | null) => {
    if (!state) {
      return null;
    }

    setIsWatching(state.is_watching);
    setWatcherCount(state.watcher_count);
    setError(null);
    return state;
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase || authStatus !== "authenticated") {
      setIsWatching(false);
      return null;
    }

    setIsLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc(
      "get_issue_watch_state",
      {
        p_issue_id: issueId,
      },
    );

    setIsLoading(false);

    if (rpcError) {
      if (process.env.NODE_ENV === "development") {
        console.error("get_issue_watch_state RPC error", rpcError);
      }

      setError("Takip durumu yüklenemedi.");
      return null;
    }

    return applyState(parseWatchState(data));
  }, [applyState, authStatus, issueId, supabase]);

  useEffect(() => {
    if (authStatus === "authenticated") {
      void refresh();
    }

    if (authStatus === "unauthenticated") {
      setIsWatching(false);
    }
  }, [authStatus, refresh]);

  const runWatchRpc = useCallback(
    async (rpcName: "follow_issue" | "unfollow_issue") => {
      if (!supabase || authStatus !== "authenticated") {
        setError("Bu sorunu takip etmek için giriş yapmalısın.");
        return null;
      }

      const previousIsWatching = isWatching;
      const previousWatcherCount = watcherCount;
      const nextIsWatching = rpcName === "follow_issue";

      setIsLoading(true);
      setError(null);
      setIsWatching(nextIsWatching);
      setWatcherCount((current) => {
        if (typeof current !== "number") {
          return current;
        }

        if (nextIsWatching && !previousIsWatching) {
          return current + 1;
        }

        if (!nextIsWatching && previousIsWatching) {
          return Math.max(0, current - 1);
        }

        return current;
      });

      const { data, error: rpcError } = await supabase.rpc(rpcName, {
        p_issue_id: issueId,
      });

      setIsLoading(false);

      if (rpcError) {
        if (process.env.NODE_ENV === "development") {
          console.error(`${rpcName} RPC error`, rpcError);
        }

        setIsWatching(previousIsWatching);
        setWatcherCount(previousWatcherCount);
        setError(mapWatchError(rpcError.message));
        return null;
      }

      return applyState(parseWatchState(data));
    },
    [applyState, authStatus, isWatching, issueId, supabase, watcherCount],
  );

  const follow = useCallback(
    () => runWatchRpc("follow_issue"),
    [runWatchRpc],
  );
  const unfollow = useCallback(
    () => runWatchRpc("unfollow_issue"),
    [runWatchRpc],
  );
  const toggleWatch = useCallback(
    () => (isWatching ? unfollow() : follow()),
    [follow, isWatching, unfollow],
  );

  return {
    authStatus,
    error,
    follow,
    isLoading,
    isWatching,
    refresh,
    toggleWatch,
    unfollow,
    watcherCount,
  };
}

function parseWatchState(value: unknown): IssueWatchState | null {
  const result = Array.isArray(value) ? value[0] : value;

  if (!result || typeof result !== "object") {
    return null;
  }

  const record = result as Record<string, unknown>;

  if (
    typeof record.issue_id !== "string" ||
    typeof record.is_watching !== "boolean" ||
    typeof record.notification_enabled !== "boolean"
  ) {
    return null;
  }

  return {
    is_watching: record.is_watching,
    issue_id: record.issue_id,
    notification_enabled: record.notification_enabled,
    watcher_count:
      typeof record.watcher_count === "number" ? record.watcher_count : 0,
  };
}

function mapWatchError(message: string) {
  if (message.includes("authentication_required")) {
    return "Bu sorunu takip etmek için giriş yapmalısın.";
  }

  if (message.includes("issue_not_found")) {
    return "Bu yol sorunu artık aktif haritada görünmüyor.";
  }

  return "Takip durumu güncellenirken bir hata oluştu.";
}
