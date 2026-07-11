import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink } from "lucide-react";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
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
  getIssuePublicUrl,
  getIssueShareText,
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
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  async function handleCopyShareLink() {
    if (!navigator.clipboard) {
      setShareFeedback("Kopyalanamadı.");
      return;
    }

    try {
      await navigator.clipboard.writeText(
        `${getIssueShareText(issue)} ${getIssuePublicUrl(
          issue.id,
          window.location.origin,
        )}`,
      );
      setShareFeedback("Kopyalandı.");
    } catch {
      setShareFeedback("Kopyalanamadı.");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge>{categoryLabels[issue.category]}</Badge>
          <Badge muted>{severityLabels[issue.severity]}</Badge>
          <Badge muted>{statusLabels[issue.status]}</Badge>
          <IntensityBadge level={intensity.level}>
            {intensity.label}
          </IntensityBadge>
        </div>
        <h2 className="text-xl font-semibold leading-tight text-ink">
          {categoryLabels[issue.category]}
        </h2>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/62 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">
            Yoğunluk: {intensity.label}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              onClick={handleCopyShareLink}
              type="button"
            >
              {shareFeedback === "Kopyalandı." ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              Paylaş
            </button>
            <Link
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              href={`/i/${issue.id}`}
            >
              Detayı aç
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </div>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          {getIssueIntensityDescription(issue)}
        </p>
        {shareFeedback ? (
          <p className="mt-2 text-xs font-semibold text-emerald-700">
            {shareFeedback}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <MiniMetric
          label="Açık süre"
          value={`${daysOpen(issue.first_reported_at)} gün`}
        />
        <MiniMetric label="Bildiren" value={`${issue.reporter_count}`} />
        <MiniMetric label="Doğrulama" value={`${verifiedUserCount}`} />
        <MiniMetric label="Hasar" value={`${issue.damage_count}`} />
      </div>
      <p className="text-xs text-ink-subtle">
        Son doğrulama: {formatLastVerified(issue.last_verified_at)}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {issueActions.map((action) => (
          <ActionButton
            action={action}
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
        <div className="rounded-2xl border border-slate-200 bg-white/62 p-3">
          {isWithdrawConfirmVisible ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-ink">
                Bu bildirimi geri çekmek istediğine emin misin?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="min-h-11 rounded-full border border-slate-200 bg-white/72 px-4 text-sm font-semibold text-ink transition hover:bg-white"
                  disabled={isActionLoading}
                  onClick={() => setIsWithdrawConfirmVisible(false)}
                  type="button"
                >
                  Vazgeç
                </button>
                <button
                  className="min-h-11 rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isActionLoading}
                  onClick={() => onWithdraw(issue)}
                  type="button"
                >
                  {loadingAction === "withdraw" ? "Geri çekiliyor..." : "Geri çek"}
                </button>
              </div>
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
        <Alert tone={actionFeedback.tone}>{actionFeedback.message}</Alert>
      ) : null}

      {isAuthPromptVisible && authStatus !== "authenticated" ? (
        <AuthPrompt authStatus={authStatus} />
      ) : null}

      <p className="text-xs text-ink-subtle">
        Konuma yakınsan bu yol sorununu doğrulayabilir veya durumunu bildirebilirsin.
      </p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/55 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-ink-subtle">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function ActionButton({
  action,
  disabledReason,
  isActionLoading,
  issue,
  loadingAction,
  onAction,
}: {
  action: { label: string; loadingLabel: string; value: IssueActionType };
  disabledReason: string | null;
  isActionLoading: boolean;
  issue: PublicRoadIssue;
  loadingAction: IssueActionType | null;
  onAction: (action: IssueActionType, issue: PublicRoadIssue) => void;
}) {
  const isDisabled = isActionLoading || Boolean(disabledReason);

  return (
    <div>
      <button
        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white/72 px-3 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isDisabled}
        onClick={() => onAction(action.value, issue)}
        type="button"
      >
        {loadingAction === action.value ? action.loadingLabel : action.label}
      </button>
      {disabledReason ? (
        <p className="mt-1 px-1 text-xs leading-4 text-ink-subtle">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}

function getDisabledReason(
  action: IssueActionType,
  userState: IssueUserState | null,
) {
  if (action === "verify") {
    if (userState?.has_active_report) {
      return "Bu sorunu zaten bildirdin.";
    }

    if (userState?.has_verified) {
      return "Bu yol sorununu yakın zamanda doğruladın.";
    }
  }

  if (action === "damage" && userState?.has_damage_report) {
    return "Bu yol sorunu için araç hasarını zaten bildirdin.";
  }

  return null;
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
