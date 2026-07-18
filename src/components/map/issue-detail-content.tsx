import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Copy,
  ExternalLink,
  MessageCircle,
  Share2,
} from "lucide-react";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { IssueWatchButton } from "@/components/issues/issue-watch-button";
import { IssueReporterIdentity } from "@/components/moderation/issue-reporter-identity";
import {
  categoryLabels,
  severityLabels,
  statusLabels,
} from "@/lib/domain/road-issue-options";
import type {
  IssueActionFeedback,
  IssueActionType,
  IssueUserState,
  PublicRoadIssue,
} from "@/lib/road-issues/types";
import {
  calculateIssueIntensity,
  getIssueIntensityClassName,
  getIssueIntensityDescription,
} from "@/lib/issues/issue-intensity";
import {
  getFacebookShareUrl,
  getIssuePublicUrl,
  getTwitterShareUrl,
  getWhatsAppShareUrl,
} from "@/lib/issues/issue-share";
import { cn } from "@/lib/utils";

type IssueDetailContentProps = {
  actionFeedback: IssueActionFeedback | null;
  authStatus: "loading" | "authenticated" | "unauthenticated" | "unconfigured";
  issue: PublicRoadIssue;
  isAuthPromptVisible: boolean;
  loadingAction: IssueActionType | null;
  onAction: (action: IssueActionType, issue: PublicRoadIssue) => void;
  onWithdraw: (issue: PublicRoadIssue) => void;
  userState: IssueUserState | null;
};

const issueActions: { label: string; loadingLabel: string; value: IssueActionType }[] =
  [
    {
      label: "Ben de gördüm",
      loadingLabel: "Doğrulanıyor...",
      value: "verify",
    },
    {
      label: "Araç hasarı yaşadım",
      loadingLabel: "Kaydediliyor...",
      value: "damage",
    },
    {
      label: "Çözüldü",
      loadingLabel: "Kaydediliyor...",
      value: "solved",
    },
    {
      label: "Yanlış / burada değil",
      loadingLabel: "Kaydediliyor...",
      value: "false_report",
    },
  ];

export function IssueDetailContent({
  actionFeedback,
  authStatus,
  issue,
  isAuthPromptVisible,
  loadingAction,
  onAction,
  onWithdraw,
  userState,
}: IssueDetailContentProps) {
  const verifiedUserCount = issue.verification_count;
  const isActionLoading = loadingAction !== null;
  const intensity = calculateIssueIntensity(issue);
  const [isWithdrawConfirmVisible, setIsWithdrawConfirmVisible] =
    useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<IssueActionFeedback | null>(
    null,
  );
  const disabledHelper = getFirstDisabledReason(userState);
  const visibleFeedback =
    localFeedback ?? compactActionFeedback(actionFeedback) ?? disabledHelper;
  const handleWatchFeedback = useCallback(
    (message: string, tone: "error" | "success") => {
      setLocalFeedback({
        message,
        tone,
      });
    },
    [],
  );

  useEffect(() => {
    if (actionFeedback) {
      setLocalFeedback(null);
    }
  }, [actionFeedback]);

  useEffect(() => {
    setLocalFeedback(null);
    setIsShareMenuOpen(false);
  }, [issue.id]);

  return (
    <div className="space-y-2">
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <Badge>{categoryLabels[issue.category]}</Badge>
          <Badge muted>{severityLabels[issue.severity]}</Badge>
          <Badge muted>{statusLabels[issue.status]}</Badge>
          <IntensityBadge level={intensity.level}>
            {intensity.label}
          </IntensityBadge>
        </div>
        <h2 className="text-lg font-semibold leading-tight text-ink">
          {categoryLabels[issue.category]}
        </h2>
        <p className="mt-0.5 text-xs font-semibold text-ink-subtle">
          {daysOpen(issue.first_reported_at)} gündür açık görünüyor
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/62 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-ink">{intensity.label}</p>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <button
                aria-expanded={isShareMenuOpen}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
                onClick={() => {
                  setIsShareMenuOpen((current) => !current);
                  setLocalFeedback(null);
                }}
                type="button"
              >
                <Share2 className="size-3.5" />
                Paylaş
              </button>
              {isShareMenuOpen ? (
                <IssueShareMenu
                  issue={issue}
                  onClose={() => setIsShareMenuOpen(false)}
                  onFeedback={(message) => {
                    setLocalFeedback({
                      message:
                        message.length > 42
                          ? "Bağlantı kopyalandı."
                          : message,
                      tone: "success",
                    });
                  }}
                />
              ) : null}
            </div>
            <Link
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              href={`/i/${issue.id}`}
            >
              Detayı aç
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </div>
        <p className="mt-1 truncate text-xs leading-4 text-ink-muted">
          {getIssueIntensityDescription(issue)}
        </p>
      </div>

      <IssueWatchButton
        compact
        hideCount
        hideInlineMessages
        initialWatcherCount={issue.watcher_count}
        issueId={issue.id}
        onFeedback={handleWatchFeedback}
      />

      <FeedbackSlot feedback={visibleFeedback} />

      <IssueReporterIdentity issueId={issue.id} />

      <div className="grid grid-cols-2 gap-1.5 text-sm">
        <MiniMetric
          label="Açık süre"
          value={`${daysOpen(issue.first_reported_at)} gün`}
        />
        <MiniMetric label="Bildiren" value={`${issue.reporter_count}`} />
        <MiniMetric label="Doğrulama" value={`${verifiedUserCount}`} />
        <MiniMetric label="Hasar" value={`${issue.damage_count}`} />
      </div>
      <p className="text-[11px] text-ink-subtle">
        Son doğrulama: {formatLastVerified(issue.last_verified_at)}
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        {issueActions.map((action) => (
          <ActionButton
            action={action}
            displayLabel={getActionDisplayLabel(action.value, userState)}
            disabledReason={getDisabledReason(action.value, userState)}
            isActionLoading={isActionLoading}
            issue={issue}
            key={action.value}
            loadingAction={loadingAction}
            onAction={onAction}
          />
        ))}
      </div>

      {userState?.has_active_report ? (
        <div className="rounded-2xl border border-slate-200 bg-white/62 p-2">
          {isWithdrawConfirmVisible ? (
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-1.5">
              <p className="min-w-0 truncate text-xs font-semibold text-ink">
                Geri çekilsin mi?
              </p>
              <button
                className="min-h-10 rounded-full border border-slate-200 bg-white/72 px-3 text-xs font-semibold text-ink transition hover:bg-white"
                disabled={isActionLoading}
                onClick={() => setIsWithdrawConfirmVisible(false)}
                type="button"
              >
                Vazgeç
              </button>
              <button
                className="min-h-10 rounded-full bg-road-blue px-3 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isActionLoading}
                onClick={() => onWithdraw(issue)}
                type="button"
              >
                {loadingAction === "withdraw" ? "Çekiliyor..." : "Geri çek"}
              </button>
            </div>
          ) : (
            <button
              className="min-h-11 w-full rounded-full border border-slate-200 bg-white/72 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isActionLoading}
              onClick={() => setIsWithdrawConfirmVisible(true)}
              type="button"
            >
              Bildirimi geri çek
            </button>
          )}
        </div>
      ) : null}

      {actionFeedback ? (
        <span className="sr-only">{actionFeedback.message}</span>
      ) : null}

      {isAuthPromptVisible && authStatus !== "authenticated" ? (
        <AuthPrompt authStatus={authStatus} />
      ) : null}

    </div>
  );
}

function IssueShareMenu({
  issue,
  onClose,
  onFeedback,
}: {
  issue: PublicRoadIssue;
  onClose: () => void;
  onFeedback: (message: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function getPublicUrl() {
    return getIssuePublicUrl(issue.id, window.location.origin);
  }

  function openShareUrl(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  async function copyToClipboard(message: string) {
    if (!navigator.clipboard) {
      onFeedback("Bağlantı kopyalanamadı.");
      onClose();
      return;
    }

    try {
      await navigator.clipboard.writeText(getPublicUrl());
      onFeedback(message);
    } catch {
      onFeedback("Bağlantı kopyalanamadı.");
    }

    onClose();
  }

  return (
    <div
      className="glass-panel absolute right-3 top-[calc(100%+8px)] z-[760] w-60 rounded-2xl p-2 shadow-xl"
      ref={menuRef}
      role="menu"
    >
      <ShareMenuButton
        icon={<span className="text-sm font-black">X</span>}
        label="X'te paylaş"
        onClick={() => openShareUrl(getTwitterShareUrl(issue, window.location.origin))}
      />
      <ShareMenuButton
        icon={<Camera className="size-4" />}
        label="Instagram için linki kopyala"
        onClick={() =>
          copyToClipboard(
            "Bağlantı kopyalandı. Instagram'da paylaşırken yapıştırabilirsin.",
          )
        }
      />
      <ShareMenuButton
        icon={<span className="text-base font-black">f</span>}
        label="Facebook'ta paylaş"
        onClick={() => openShareUrl(getFacebookShareUrl(issue, window.location.origin))}
      />
      <ShareMenuButton
        icon={<MessageCircle className="size-4" />}
        label="WhatsApp ile paylaş"
        onClick={() => openShareUrl(getWhatsAppShareUrl(issue, window.location.origin))}
      />
      <ShareMenuButton
        icon={<Copy className="size-4" />}
        label="Panoya kopyala"
        onClick={() => copyToClipboard("Bağlantı kopyalandı.")}
      />
    </div>
  );
}

function ShareMenuButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink transition hover:bg-white/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <span className="flex size-6 shrink-0 items-center justify-center text-ink-muted">
        {icon}
      </span>
      {label}
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/55 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase text-ink-subtle">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function ActionButton({
  action,
  displayLabel,
  disabledReason,
  isActionLoading,
  issue,
  loadingAction,
  onAction,
}: {
  action: { label: string; loadingLabel: string; value: IssueActionType };
  displayLabel: string;
  disabledReason: string | null;
  isActionLoading: boolean;
  issue: PublicRoadIssue;
  loadingAction: IssueActionType | null;
  onAction: (action: IssueActionType, issue: PublicRoadIssue) => void;
}) {
  const isDisabled = isActionLoading || Boolean(disabledReason);

  return (
    <button
      className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white/72 px-2.5 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isDisabled}
      onClick={() => onAction(action.value, issue)}
      type="button"
    >
      {loadingAction === action.value ? action.loadingLabel : displayLabel}
    </button>
  );
}

function FeedbackSlot({
  feedback,
}: {
  feedback: IssueActionFeedback | null;
}) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex h-6 items-center rounded-full border px-3 text-[11px] font-semibold",
        feedback
          ? feedback.tone === "error"
            ? "border-red-200 bg-red-50/75 text-red-700"
            : "border-emerald-200 bg-emerald-50/75 text-emerald-700"
          : "border-transparent bg-transparent text-transparent",
      )}
    >
      <span className="truncate">{feedback?.message ?? "Durum"}</span>
    </div>
  );
}

function compactActionFeedback(
  feedback: IssueActionFeedback | null,
): IssueActionFeedback | null {
  if (!feedback) {
    return null;
  }

  if (feedback.tone === "success") {
    return {
      message: "İşlem tamamlandı.",
      tone: "success",
    };
  }

  if (feedback.message.includes("yaklaşık 500 metre")) {
    return {
      message: "Konuma yakın olmalısın.",
      tone: "error",
    };
  }

  if (feedback.message.includes("zaten bildirdin")) {
    return {
      message: "Zaten bildirdin.",
      tone: "error",
    };
  }

  if (feedback.message.includes("hasarını zaten")) {
    return {
      message: "Hasarı bildirdin.",
      tone: "error",
    };
  }

  return {
    message: feedback.message.length > 28 ? "İşlem yapılamadı." : feedback.message,
    tone: "error",
  };
}

function getFirstDisabledReason(
  userState: IssueUserState | null,
): IssueActionFeedback | null {
  if (userState?.has_active_report) {
    return {
      message: "Zaten bildirdin.",
      tone: "error",
    };
  }

  if (userState?.has_damage_report) {
    return {
      message: "Hasarı bildirdin.",
      tone: "error",
    };
  }

  if (userState?.has_verified) {
    return {
      message: "Yakın zamanda doğruladın.",
      tone: "error",
    };
  }

  return null;
}

function getDisabledReason(
  action: IssueActionType,
  userState: IssueUserState | null,
) {
  if (action === "verify") {
    if (userState?.has_active_report) {
      return "Zaten bildirdin.";
    }

    if (userState?.has_verified) {
      return "Yakın zamanda doğruladın.";
    }
  }

  if (action === "damage" && userState?.has_damage_report) {
    return "Hasarı bildirdin.";
  }

  return null;
}

function getActionDisplayLabel(
  action: IssueActionType,
  userState: IssueUserState | null,
) {
  if (action === "solved" && userState?.has_solved_report) {
    return "Çözüldü geri al";
  }

  if (action === "false_report" && userState?.has_false_report) {
    return "Yanlış bildirimi geri al";
  }

  return issueActions.find((item) => item.value === action)?.label ?? "";
}

function Badge({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        muted ? "bg-surface-muted text-ink-muted" : "bg-road-blue text-white",
      )}
    >
      {children}
    </span>
  );
}

function IntensityBadge({
  children,
  level,
}: {
  children: React.ReactNode;
  level: ReturnType<typeof calculateIssueIntensity>["level"];
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-semibold",
        getIssueIntensityClassName(level),
      )}
    >
      {children}
    </span>
  );
}

function AuthPrompt({
  authStatus,
}: {
  authStatus: IssueDetailContentProps["authStatus"];
}) {
  if (authStatus === "loading") {
    return <p className="mt-3 text-sm text-ink-muted">Oturum kontrol ediliyor...</p>;
  }

  if (authStatus === "unconfigured") {
    return (
      <Alert tone="error">
        Bu işlem için Supabase bağlantısı yapılandırılmalı.
      </Alert>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-white/62 p-3">
      <MagicLinkForm compact title="Bu işlem için giriş yapmalısın." />
    </div>
  );
}

function Alert({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "error" | "success";
}) {
  return (
    <p
      className={cn(
        "mt-3 rounded-2xl border px-3 py-2 text-sm font-semibold",
        tone === "error"
          ? "border-red-200 bg-red-50/80 text-red-700"
          : "border-emerald-200 bg-emerald-50/80 text-emerald-700",
      )}
    >
      {children}
    </p>
  );
}

function daysOpen(firstReportedAt: string) {
  const started = new Date(firstReportedAt).getTime();
  const now = Date.now();
  const diff = Math.max(now - started, 0);

  return Math.max(Math.floor(diff / 86_400_000), 0);
}

function formatLastVerified(lastVerifiedAt: string | null) {
  if (!lastVerifiedAt) {
    return "henüz doğrulanmadı";
  }

  const verifiedDate = new Date(lastVerifiedAt);
  const today = new Date();
  const isToday =
    verifiedDate.getFullYear() === today.getFullYear() &&
    verifiedDate.getMonth() === today.getMonth() &&
    verifiedDate.getDate() === today.getDate();

  if (isToday) {
    return "bugün";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(verifiedDate);
}
