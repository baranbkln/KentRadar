"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ModerationReasonDialog } from "@/components/admin/moderation-reason-dialog";
import type { AdminUser } from "@/components/admin/types";
import { createOptionalClient } from "@/lib/supabase/browser";

const PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadUsers = useCallback(async (search = "") => {
    const supabase = createOptionalClient();
    if (!supabase) {
      setError("Supabase bağlantısı kurulamadı.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    setCurrentUserId(sessionUser?.id ?? null);

    let query = supabase
      .from("profiles")
      .select("id, email, display_name, is_admin, is_suspended, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    const normalizedSearch = search.trim();
    if (normalizedSearch) {
      query = UUID_PATTERN.test(normalizedSearch)
        ? query.eq("id", normalizedSearch)
        : query.ilike("email", `%${normalizedSearch}%`);
    }

    const { data, error: usersError } = await query;
    if (usersError) {
      if (process.env.NODE_ENV === "development") {
        console.error("admin profiles query error", usersError);
      }
      setError("Kullanıcılar yüklenirken bir hata oluştu.");
      setLoading(false);
      return;
    }

    const profiles = (data ?? []) as Omit<AdminUser, "confirmed_points">[];
    const userIds = profiles.map((profile) => profile.id);
    const pointsMap = new Map<string, number>();

    if (userIds.length > 0) {
      const { data: totals, error: totalsError } = await supabase
        .from("user_score_totals")
        .select("user_id, confirmed_points")
        .in("user_id", userIds);

      if (totalsError && process.env.NODE_ENV === "development") {
        console.warn("admin user_score_totals query error", totalsError);
      }

      for (const total of totals ?? []) {
        pointsMap.set(total.user_id as string, Number(total.confirmed_points ?? 0));
      }
    }

    setUsers(
      profiles.map((profile) => ({
        ...profile,
        confirmed_points: pointsMap.get(profile.id) ?? null,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleSuspend = async (reason: string) => {
    if (!selectedUser) return;
    const supabase = createOptionalClient();
    if (!supabase) {
      setActionError("Supabase bağlantısı kurulamadı.");
      return;
    }

    setSubmitting(true);
    setActionError(null);
    const { error: rpcError } = await supabase.rpc("admin_suspend_user", {
      p_target_user_id: selectedUser.id,
      p_reason: reason,
    });

    if (rpcError) {
      if (process.env.NODE_ENV === "development") {
        console.error("admin_suspend_user RPC error", rpcError);
      }
      setActionError("Kullanıcı askıya alınamadı.");
      setSubmitting(false);
      return;
    }

    setUsers((current) =>
      current.map((user) =>
        user.id === selectedUser.id ? { ...user, is_suspended: true } : user,
      ),
    );
    setFeedback("Kullanıcı hesabı askıya alındı.");
    setSelectedUser(null);
    setSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Kullanıcı Yönetimi</h1>
          <p className="mt-1 text-sm text-slate-400">
            Hesapları e-posta veya tam kullanıcı kimliğiyle arayın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsers(activeSearch)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Yenile
        </button>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const nextSearch = searchInput.trim();
          setActiveSearch(nextSearch);
          void loadUsers(nextSearch);
        }}
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">E-posta veya kullanıcı kimliği ara</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="E-posta veya kullanıcı kimliği"
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-cyan-600 px-5 text-sm font-semibold text-white transition hover:bg-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Ara
        </button>
      </form>

      {feedback ? (
        <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid min-h-56 place-items-center text-sm text-slate-400">
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Kullanıcılar yükleniyor...
          </span>
        </div>
      ) : users.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center text-sm text-slate-400">
          Aramayla eşleşen kullanıcı bulunamadı.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            return (
              <article key={user.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/5 text-slate-300">
                      <UserRound className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {user.display_name || user.email || "İsimsiz kullanıcı"}
                      </p>
                      {user.display_name && user.email ? (
                        <p className="truncate text-xs text-slate-400">{user.email}</p>
                      ) : null}
                      <p className="mt-1 font-mono text-[11px] text-slate-600" title={user.id}>
                        {shortId(user.id)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {user.is_admin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-1 text-[11px] font-semibold text-cyan-200">
                        <ShieldCheck className="size-3" aria-hidden="true" />
                        Yönetici
                      </span>
                    ) : null}
                    {user.is_suspended ? (
                      <span className="rounded-full bg-rose-400/10 px-2 py-1 text-[11px] font-semibold text-rose-200">
                        Askıda
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-950/45 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Kesinleşmiş puan</p>
                    <p className="mt-0.5 text-lg font-bold text-white">
                      {user.confirmed_points ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-950/45 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Kayıt tarihi</p>
                    <p className="mt-1 text-sm font-semibold text-slate-200">
                      {formatDate(user.created_at)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={user.is_suspended || isSelf}
                  onClick={() => {
                    setActionError(null);
                    setSelectedUser(user);
                  }}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Ban className="size-4" aria-hidden="true" />
                  {user.is_suspended
                    ? "Hesap askıya alındı"
                    : isSelf
                      ? "Kendi hesabın"
                      : "Hesabı Askıya Al"}
                </button>
              </article>
            );
          })}
        </div>
      )}

      <ModerationReasonDialog
        open={selectedUser !== null}
        title="Hesabı askıya al"
        description={
          selectedUser
            ? `${selectedUser.display_name || selectedUser.email || shortId(selectedUser.id)} hesabının yeni katkı oluşturması engellenecek.`
            : ""
        }
        confirmLabel="Hesabı Askıya Al"
        loading={submitting}
        error={actionError}
        onClose={() => {
          if (!submitting) {
            setSelectedUser(null);
            setActionError(null);
          }
        }}
        onConfirm={handleSuspend}
      />
    </div>
  );
}
