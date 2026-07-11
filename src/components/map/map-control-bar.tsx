"use client";

import {
  Filter,
  ListFilter,
  LocateFixed,
  LogIn,
  LogOut,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { ActiveFilterSummary } from "@/components/map/active-filter-summary";
import { FilterSheet } from "@/components/map/filter-sheet";
import { FloatingMapButton } from "@/components/map/floating-map-button";
import { GlassPanel } from "@/components/map/glass-panel";
import type { RoadIssueFilters } from "@/lib/road-issues/types";

type MapControlBarProps = {
  authStatus: "loading" | "authenticated" | "unauthenticated" | "unconfigured";
  filters: RoadIssueFilters;
  isAuthPanelOpen: boolean;
  isFilterOpen: boolean;
  isIssueRankingButtonDisabled: boolean;
  isIssueRankingPreviewOpen: boolean;
  locationMessage: string | null;
  totalCount: number;
  visibleCount: number;
  userEmail: string | null;
  onFiltersChange: (filters: RoadIssueFilters) => void;
  onFilterClose: () => void;
  onAddIssue: () => void;
  onSignOut: () => void;
  onToggleAuthPanel: () => void;
  onToggleFilters: () => void;
  onToggleIssueRankingPreview: () => void;
  onUseLocation: () => void;
};

export function MapControlBar({
  authStatus,
  filters,
  isAuthPanelOpen,
  isFilterOpen,
  isIssueRankingButtonDisabled,
  isIssueRankingPreviewOpen,
  locationMessage,
  totalCount,
  visibleCount,
  userEmail,
  onFiltersChange,
  onFilterClose,
  onAddIssue,
  onSignOut,
  onToggleAuthPanel,
  onToggleFilters,
  onToggleIssueRankingPreview,
  onUseLocation,
}: MapControlBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[700] p-3 pt-[max(12px,env(safe-area-inset-top))] md:p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <GlassPanel className="pointer-events-auto flex min-h-14 items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight md:text-lg">
              YolDurumu
            </h1>
            <p className="truncate text-xs text-ink-muted md:text-sm">
              {visibleCount} / {totalCount} yol sorunu gösteriliyor
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <FloatingMapButton
              aria-label="Konumumu kullan"
              onClick={onUseLocation}
            >
              <LocateFixed className="size-5" />
            </FloatingMapButton>
            <FloatingMapButton
              aria-label="Sorun ekle"
              label="Sorun ekle"
              onClick={onAddIssue}
              title="Yol sorunu bildir"
            >
              <Plus className="size-5" />
            </FloatingMapButton>
            <FloatingMapButton
              aria-expanded={isFilterOpen}
              aria-label="Filtreler"
              onClick={onToggleFilters}
            >
              <Filter className="size-5" />
            </FloatingMapButton>
            <FloatingMapButton
              aria-expanded={isIssueRankingPreviewOpen}
              aria-label="Sorun Listesi"
              disabled={isIssueRankingButtonDisabled}
              onClick={onToggleIssueRankingPreview}
              title="Sorun Listesi"
            >
              <ListFilter className="size-5" />
              <span className="hidden lg:inline">Sorun Listesi</span>
            </FloatingMapButton>
            {authStatus === "authenticated" ? (
              <div className="glass-panel hidden min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-ink sm:inline-flex">
                <Link
                  className="max-w-[150px] truncate rounded-full px-2 py-1 transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
                  href="/profile"
                >
                  {shortenEmail(userEmail)}
                </Link>
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
                label="Giriş yap"
                onClick={onToggleAuthPanel}
              >
                <LogIn className="size-5" />
              </FloatingMapButton>
            )}
            {authStatus === "authenticated" ? (
              <>
                <Link
                  aria-label="Profilim"
                  className="glass-panel inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-ink transition hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue sm:hidden"
                  href="/profile"
                  title={shortenEmail(userEmail)}
                >
                  {shortenEmail(userEmail).slice(0, 1)}
                </Link>
                <FloatingMapButton
                  aria-label="Çıkış yap"
                  className="sm:hidden"
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
          <GlassPanel className="pointer-events-auto max-w-md px-4 py-3 text-sm text-ink-muted">
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
