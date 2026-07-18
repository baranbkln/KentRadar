"use client";

import {
  CalendarCheck,
  Filter,
  Info,
  ListFilter,
  LocateFixed,
  LogIn,
  LogOut,
  Plus,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { AnimatedScore } from "@/components/gamification/animated-score";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ActiveFilterSummary } from "@/components/map/active-filter-summary";
import { FilterSheet } from "@/components/map/filter-sheet";
import { FloatingMapButton } from "@/components/map/floating-map-button";
import { GlassPanel } from "@/components/map/glass-panel";
import { PlayerAvatar } from "@/components/profile/player-avatar";
import type { AccountSummary } from "@/hooks/use-account-summary";
import type { RoadIssueFilters } from "@/lib/road-issues/types";

type MapControlBarProps = {
  authStatus: "loading" | "authenticated" | "unauthenticated" | "unconfigured";
  filters: RoadIssueFilters;
  isAuthPanelOpen: boolean;
  isAccountSummaryLoading: boolean;
  isFilterOpen: boolean;
  isIssueRankingButtonDisabled: boolean;
  isIssueRankingPreviewOpen: boolean;
  isLeaderboardPreviewOpen: boolean;
  isProfilePreviewOpen: boolean;
  locationMessage: string | null;
  totalCount: number;
  visibleCount: number;
  accountSummary: AccountSummary;
  userEmail: string | null;
  onFiltersChange: (filters: RoadIssueFilters) => void;
  onFilterClose: () => void;
  onAddIssue: () => void;
  onSignOut: () => void;
  onToggleAuthPanel: () => void;
  onToggleFilters: () => void;
  onToggleIssueRankingPreview: () => void;
  onToggleLeaderboardPreview: () => void;
  onToggleProfilePreview: () => void;
  onNotificationOpen: () => void;
  onUseLocation: () => void;
};

export function MapControlBar({
  authStatus,
  filters,
  isAuthPanelOpen,
  isAccountSummaryLoading,
  isFilterOpen,
  isIssueRankingButtonDisabled,
  isIssueRankingPreviewOpen,
  isLeaderboardPreviewOpen,
  isProfilePreviewOpen,
  locationMessage,
  totalCount,
  visibleCount,
  accountSummary,
  userEmail,
  onFiltersChange,
  onFilterClose,
  onAddIssue,
  onSignOut,
  onToggleAuthPanel,
  onToggleFilters,
  onToggleIssueRankingPreview,
  onToggleLeaderboardPreview,
  onToggleProfilePreview,
  onNotificationOpen,
  onUseLocation,
}: MapControlBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[700] p-3 pt-[max(12px,env(safe-area-inset-top))] md:p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <GlassPanel className="pointer-events-auto flex min-h-[72px] flex-wrap items-center justify-between gap-3 px-3 py-2.5 md:flex-nowrap md:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 shrink-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold leading-tight md:text-lg">
                  KentRadar
                </h1>
                <Link
                  aria-label="Projenin Amacı"
                  className="hidden min-h-8 items-center gap-1 rounded-full border border-slate-200 bg-white/52 px-2.5 text-xs font-semibold text-ink-muted transition hover:bg-white/80 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue sm:inline-flex"
                  href="/about"
                >
                  <Info className="size-3.5" />
                  Amaç
                </Link>
              </div>
              <p className="truncate text-xs text-ink-muted md:text-sm">
                {visibleCount} / {totalCount} yol sorunu gösteriliyor
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 md:gap-2">
            <FloatingMapButton
              aria-label="Konumumu kullan"
              className="bg-white/55 shadow-none"
              onClick={onUseLocation}
            >
              <LocateFixed className="size-5" />
            </FloatingMapButton>
            <FloatingMapButton
              aria-label="Sorun ekle"
              className="bg-white/55 shadow-none"
              label="Sorun ekle"
              onClick={onAddIssue}
              title="Yol sorunu bildir"
            >
              <Plus className="size-5" />
            </FloatingMapButton>
            <FloatingMapButton
              aria-expanded={isFilterOpen}
              aria-label="Filtreler"
              className="bg-white/55 shadow-none"
              onClick={onToggleFilters}
            >
              <Filter className="size-5" />
            </FloatingMapButton>
            <FloatingMapButton
              aria-expanded={isIssueRankingPreviewOpen}
              aria-label="Sorun Listesi"
              className="bg-white/55 shadow-none"
              disabled={isIssueRankingButtonDisabled}
              onClick={onToggleIssueRankingPreview}
              title="Sorun Listesi"
            >
              <ListFilter className="size-5" />
              <span className="hidden lg:inline">Sorun Listesi</span>
            </FloatingMapButton>
            <FloatingMapButton
              aria-expanded={isLeaderboardPreviewOpen}
              aria-label="Katkıcılar"
              className="bg-white/55 shadow-none"
              disabled={isIssueRankingButtonDisabled}
              onClick={onToggleLeaderboardPreview}
              title="Katkıcılar"
            >
              <Trophy className="size-5" />
              <span className="hidden xl:inline">Katkıcılar</span>
            </FloatingMapButton>
            <Link
              aria-label="Son Çözülenler"
              className="glass-panel inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-white/55 px-3 text-sm font-semibold text-ink shadow-none transition hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              href="/fixed"
              title="Son Çözülenler"
            >
              <CalendarCheck className="size-5" />
              <span className="hidden 2xl:inline">Son Çözülenler</span>
            </Link>
            {authStatus === "authenticated" ? (
              <NotificationBell onOpen={onNotificationOpen} />
            ) : null}
            {authStatus === "authenticated" ? (
              <div className="hidden min-h-11 items-center gap-1.5 rounded-full bg-white/55 px-2 text-sm font-semibold text-ink sm:inline-flex">
                <PlayerAvatar
                  avatarStyle={accountSummary.avatarStyle}
                  className="size-8 rounded-xl"
                  iconClassName="size-4"
                  label={`${accountSummary.username ?? "Oyuncu"} avatarı`}
                />
                <button
                  aria-expanded={isProfilePreviewOpen}
                  className="max-w-[168px] truncate rounded-full px-2 py-1 text-left transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue lg:max-w-[220px]"
                  onClick={onToggleProfilePreview}
                  type="button"
                >
                  <span className="block truncate text-xs font-semibold leading-4 text-ink">
                    {isAccountSummaryLoading
                      ? "Hesap"
                      : (
                          <>
                            {accountSummary.levelLabel} ·{" "}
                            <AnimatedScore
                              value={accountSummary.confirmedPoints}
                            />{" "}
                            puan
                          </>
                        )}
                  </span>
                  <span className="block truncate text-[11px] leading-4 text-ink-muted">
                    {accountSummary.username ?? shortenEmail(userEmail)}
                  </span>
                </button>
                <button
                  className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-ink-muted transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
                  onClick={onSignOut}
                  type="button"
                >
                  <LogOut className="size-3.5" />
                  Çıkış yap
                </button>
              </div>
            ) : (
              <FloatingMapButton
                aria-expanded={isAuthPanelOpen}
                aria-label="Giriş yap"
                className="bg-white/55 shadow-none"
                label="Giriş yap"
                onClick={onToggleAuthPanel}
              >
                <LogIn className="size-5" />
              </FloatingMapButton>
            )}
            {authStatus === "authenticated" ? (
              <>
                <button
                  aria-expanded={isProfilePreviewOpen}
                  aria-label="Profilim"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/55 px-3 text-sm font-semibold text-ink transition hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue sm:hidden"
                  onClick={onToggleProfilePreview}
                  title={shortenEmail(userEmail)}
                  type="button"
                >
                  {isAccountSummaryLoading
                    ? "..."
                    : (
                        <AnimatedScore
                          value={accountSummary.confirmedPoints}
                        />
                      )}
                </button>
                <FloatingMapButton
                  aria-label="Çıkış yap"
                  className="bg-white/55 shadow-none sm:hidden"
                  onClick={onSignOut}
                >
                  <LogOut className="size-5" />
                </FloatingMapButton>
              </>
            ) : null}
          </div>
        </GlassPanel>

        {isAuthPanelOpen && authStatus !== "authenticated" ? (
          <AuthPanel authStatus={authStatus} />
        ) : null}

        {locationMessage ? (
          <GlassPanel className="glass-panel-subtle pointer-events-auto w-fit max-w-[320px] rounded-full px-3.5 py-2 text-xs font-semibold text-ink-muted">
            {locationMessage}
          </GlassPanel>
        ) : null}

        <ActiveFilterSummary filters={filters} onChange={onFiltersChange} />

        {isFilterOpen ? (
          <FilterSheet
            filters={filters}
            onApply={(nextFilters) => {
              onFiltersChange(nextFilters);
              onFilterClose();
            }}
            onClose={onFilterClose}
          />
        ) : null}
      </div>
    </div>
  );
}

function AuthPanel({
  authStatus,
}: {
  authStatus: MapControlBarProps["authStatus"];
}) {
  if (authStatus === "loading") {
    return (
      <GlassPanel className="pointer-events-auto max-w-sm px-4 py-3 text-sm text-ink-muted">
        Oturum kontrol ediliyor...
      </GlassPanel>
    );
  }

  if (authStatus === "unconfigured") {
    return (
      <GlassPanel className="pointer-events-auto max-w-sm px-4 py-3 text-sm font-semibold text-red-700">
        Supabase bağlantısı yapılandırılmalı.
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="pointer-events-auto max-w-sm p-3.5">
      <MagicLinkForm compact title="Giriş yap" />
    </GlassPanel>
  );
}

function shortenEmail(email: string | null) {
  if (!email) {
    return "Hesap";
  }

  if (email.length <= 24) {
    return email;
  }

  const [name, domain] = email.split("@");
  return `${name.slice(0, 10)}…@${domain ?? ""}`;
}
