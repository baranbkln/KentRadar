"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, ShieldCheck } from "lucide-react";
import { ReportDialog } from "@/components/moderation/report-dialog";
import {
  BadgeToken,
  parseCivicBadges,
  type CivicBadge,
} from "@/components/profile/badge-showcase";
import { PlayerAvatar } from "@/components/profile/player-avatar";
import { createOptionalClient } from "@/lib/supabase/browser";

type IssueReporterIdentityProps = {
  issueId: string;
};

type IssueReporterIdentityRow = {
  targetUserId: string | null;
  username: string | null;
  avatarStyle: string;
  publicDisplayName: string;
  confirmedPoints: number;
  isTrustedReporter: boolean;
};

export function IssueReporterIdentity({ issueId }: IssueReporterIdentityProps) {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [identity, setIdentity] = useState<IssueReporterIdentityRow | null>(null);
  const [badges, setBadges] = useState<CivicBadge[]>([]);
  const [isReportOpen, setIsReportOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let isActive = true;

    async function loadIdentity() {
      const [
        { data, error },
        { data: badgeData, error: badgeError },
      ] = await Promise.all([
        client.rpc("get_public_issue_reporter_identity", {
          p_issue_id: issueId,
        }),
        client.rpc("get_public_issue_reporter_badges", {
          p_issue_id: issueId,
          p_limit: 3,
        }),
      ]);
      if (!isActive) return;

      if (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("issue reporter identity RPC error", error);
        }
        setIdentity(null);
        setBadges([]);
        return;
      }

      const row = parseIdentity(Array.isArray(data) ? data[0] : data);
      setIdentity(row);
      if (badgeError && process.env.NODE_ENV === "development") {
        console.warn("issue reporter badges RPC error", badgeError);
      }
      setBadges(badgeError ? [] : parseCivicBadges(badgeData));
    }

    void loadIdentity();
    return () => {
      isActive = false;
    };
  }, [issueId, supabase]);

  if (!identity) return null;

  return (
    <>
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/58 px-2.5 py-1.5">
        <PlayerAvatar
          avatarStyle={identity.avatarStyle}
          className="size-8 rounded-xl"
          iconClassName="size-4"
          label={`${identity.publicDisplayName} avatarı`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase text-ink-subtle">İlk bildiren</p>
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-xs font-semibold text-ink">
              {identity.publicDisplayName}
            </p>
            {identity.isTrustedReporter ? (
              <span
                aria-label="Güvenilir Gözlemci"
                className="group relative grid size-6 shrink-0 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700"
                title="Güvenilir Gözlemci"
              >
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                <span
                  className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-40 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-center text-[11px] font-medium text-slate-200 shadow-xl group-hover:block"
                  role="tooltip"
                >
                  Güvenilir Gözlemci
                </span>
              </span>
            ) : null}
          </div>
        </div>
        <button
          aria-label={`${identity.publicDisplayName} kullanıcısını raporla`}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!identity.targetUserId}
          onClick={() => setIsReportOpen(true)}
          title={identity.targetUserId ? "Kullanıcıyı raporla" : "Raporlamak için giriş yap"}
          type="button"
        >
          <Flag className="size-4" aria-hidden="true" />
        </button>
        {badges.length > 0 ? (
          <div
            aria-label={`${identity.publicDisplayName} sivil rozetleri`}
            className="flex w-full items-center gap-1 border-t border-slate-200 pt-1.5"
          >
            {badges.map((badge) => (
              <BadgeToken
                badge={badge}
                className="min-h-8 px-2"
                key={badge.badgeId}
              />
            ))}
          </div>
        ) : null}
      </div>

      <ReportDialog
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        targetId={identity.targetUserId}
        targetLabel={identity.publicDisplayName}
        targetType="user"
      />
    </>
  );
}

function parseIdentity(value: unknown): IssueReporterIdentityRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.public_display_name !== "string" ||
    typeof row.avatar_style !== "string"
  ) {
    return null;
  }

  return {
    avatarStyle: row.avatar_style,
    confirmedPoints: numberField(row.confirmed_points),
    isTrustedReporter: row.is_trusted_reporter === true,
    publicDisplayName: row.public_display_name,
    targetUserId: typeof row.target_user_id === "string" ? row.target_user_id : null,
    username: typeof row.username === "string" ? row.username : null,
  };
}

function numberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
