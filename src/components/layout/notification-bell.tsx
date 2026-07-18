"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  Bell,
  CheckCheck,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { createOptionalClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type NotificationType =
  | "ISSUE_RESOLVED"
  | "BADGE_EARNED"
  | "TRUST_UPGRADED";

type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  issueId: string | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationBellProps = {
  onOpen?: () => void;
};

export function NotificationBell({ onOpen }: NotificationBellProps) {
  const router = useRouter();
  const supabase = useMemo(() => createOptionalClient(), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unreadCount = notifications.filter(
    (notification) => !notification.isRead,
  ).length;

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let isActive = true;
    let userId: string | null = null;

    async function initialize() {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!isActive || !user) return;
      userId = user.id;
      await loadNotifications();
    }

    async function loadNotifications() {
      setIsLoading(true);
      const { data, error: queryError } = await client
        .from("notifications")
        .select("id, type, title, message, issue_id, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!isActive) return;
      setIsLoading(false);
      if (queryError) {
        if (process.env.NODE_ENV === "development") {
          console.warn("notifications query error", queryError);
        }
        setError("Bildirimler yüklenemedi.");
        return;
      }

      setNotifications(parseNotifications(data));
      setError(null);
    }

    void initialize();

    const channel = client
      .channel("my-in-app-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          const nextNotification = parseNotification(payload.new);
          if (!nextNotification) return;
          const payloadUserId =
            payload.new && typeof payload.new.user_id === "string"
              ? payload.new.user_id
              : null;
          if (!userId || payloadUserId !== userId) return;

          setNotifications((current) => [
            nextNotification,
            ...current.filter((item) => item.id !== nextNotification.id),
          ].slice(0, 20));
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      void client.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function handleMarkAllRead() {
    if (!supabase || unreadCount === 0 || isMarkingRead) return;
    setIsMarkingRead(true);
    const { error: rpcError } = await supabase.rpc("mark_notifications_read");
    setIsMarkingRead(false);

    if (rpcError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("mark_notifications_read RPC error", rpcError);
      }
      setError("Bildirimler güncellenemedi.");
      return;
    }

    setNotifications((current) =>
      current.map((notification) => ({ ...notification, isRead: true })),
    );
    setError(null);
  }

  function handleNotificationClick(notification: NotificationRow) {
    setIsOpen(false);
    if (notification.type === "ISSUE_RESOLVED" && notification.issueId) {
      router.push(`/?issue=${notification.issueId}`);
    }
  }

  return (
    <div className="pointer-events-auto relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-label={
          unreadCount > 0
            ? `Bildirimler, ${unreadCount} okunmamış`
            : "Bildirimler"
        }
        className="relative grid size-11 place-items-center rounded-full bg-white/55 text-ink transition hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
        onClick={() => {
          setIsOpen((current) => {
            const next = !current;
            if (next) onOpen?.();
            return next;
          });
        }}
        title="Bildirimler"
        type="button"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 size-2.5 rounded-full border-2 border-white bg-emerald-500 shadow-sm"
          />
        ) : null}
      </button>

      {isOpen ? (
        <section
          aria-label="Bildirimler"
          className="fixed left-3 right-3 top-[100px] z-[900] overflow-hidden rounded-[24px] border border-slate-200 bg-white/92 shadow-[0_22px_60px_rgba(15,23,42,0.24)] backdrop-blur-2xl sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+12px)] sm:w-[360px]"
        >
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-3.5">
            <div>
              <h2 className="text-sm font-semibold text-ink">Bildirimler</h2>
              <p className="text-xs text-ink-muted">
                {unreadCount > 0
                  ? `${unreadCount} okunmamış bildirim`
                  : "Tüm bildirimler okundu"}
              </p>
            </div>
            <button
              aria-label="Bildirim panelini kapat"
              className="grid size-11 place-items-center rounded-full text-ink-muted transition hover:bg-slate-100 hover:text-ink"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-[min(420px,calc(100dvh-190px))] overflow-y-auto p-2">
            {isLoading ? (
              <p className="flex min-h-20 items-center justify-center gap-2 text-sm text-ink-muted">
                <LoaderCircle className="size-4 animate-spin" />
                Bildirimler yükleniyor...
              </p>
            ) : null}

            {error ? (
              <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}

            {!isLoading && !error && notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-ink-muted">
                Henüz bildirimin yok.
              </p>
            ) : null}

            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
              />
            ))}
          </div>

          <div className="border-t border-slate-200 p-2">
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-3 text-sm font-semibold text-ink-muted transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
              disabled={unreadCount === 0 || isMarkingRead}
              onClick={() => void handleMarkAllRead()}
              type="button"
            >
              {isMarkingRead ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <CheckCheck className="size-4" />
              )}
              Tümünü okundu işaretle
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function NotificationItem({
  notification,
  onClick,
}: {
  notification: NotificationRow;
  onClick: () => void;
}) {
  const isActionable =
    notification.type === "ISSUE_RESOLVED" && notification.issueId;

  return (
    <button
      className={cn(
        "mb-1 flex min-h-16 w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition last:mb-0 hover:bg-slate-100",
        notification.isRead ? "bg-transparent" : "bg-emerald-50/65",
      )}
      onClick={onClick}
      type="button"
    >
      <NotificationIcon type={notification.type} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <strong className="truncate text-sm font-semibold text-ink">
            {notification.title}
          </strong>
          {!notification.isRead ? (
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
          ) : null}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-ink-muted">
          {notification.message}
        </span>
        <span className="mt-1 block text-[11px] text-ink-subtle">
          {formatNotificationDate(notification.createdAt)}
          {isActionable ? " · Haritada gör" : ""}
        </span>
      </span>
    </button>
  );
}

function NotificationIcon({ type }: { type: NotificationType }) {
  const className =
    "grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white";

  if (type === "BADGE_EARNED") {
    return (
      <span className={className}>
        <Award className="size-4 text-blue-600" aria-hidden="true" />
      </span>
    );
  }
  if (type === "TRUST_UPGRADED") {
    return (
      <span className={className}>
        <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={className}>
      <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
    </span>
  );
}

function parseNotifications(value: unknown): NotificationRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const notification = parseNotification(item);
    return notification ? [notification] : [];
  });
}

function parseNotification(value: unknown): NotificationRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !isNotificationType(row.type) ||
    typeof row.title !== "string" ||
    typeof row.message !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    isRead: row.is_read === true,
    issueId: typeof row.issue_id === "string" ? row.issue_id : null,
    message: row.message,
    title: row.title,
    type: row.type,
  };
}

function isNotificationType(value: unknown): value is NotificationType {
  return (
    value === "ISSUE_RESOLVED" ||
    value === "BADGE_EARNED" ||
    value === "TRUST_UPGRADED"
  );
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
