"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  MapPinned,
  ShieldCheck,
  Users,
} from "lucide-react";
import { UserRankBadge } from "@/components/gamification/user-rank-badge";
import { GlassPanel } from "@/components/map/glass-panel";
import { PlayerAvatar } from "@/components/profile/player-avatar";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import {
  useIssueRegions,
  useLocalContributors,
  useRegionalLeaderboard,
} from "@/hooks/use-regional-leaderboard";
import {
  getLeaderboardPeriodLabel,
  leaderboardTabs,
  type LeaderboardPeriod,
  type LeaderboardRow,
  type RegionalLeaderboardRow,
} from "@/lib/leaderboard/types";
import { cn } from "@/lib/utils";

type LeaderboardView = "contributors" | "regions";

export function LeaderboardPanel({
  initialPeriod = "all_time",
}: {
  initialPeriod?: LeaderboardPeriod;
}) {
  const [view, setView] = useState<LeaderboardView>("contributors");
  const [period, setPeriod] = useState(initialPeriod);
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const globalLeaderboard = useLeaderboard(period, 25);
  const localLeaderboard = useLocalContributors(city, district, 25);
  const regionalLeaderboard = useRegionalLeaderboard(city, 25);
  const { regions, isLoading: areRegionsLoading } = useIssueRegions();

  const cities = useMemo(
    () =>
      Array.from(new Set(regions.map((region) => region.city))).sort((a, b) =>
        a.localeCompare(b, "tr"),
      ),
    [regions],
  );
  const districts = useMemo(
    () =>
      Array.from(
        new Set(
          regions.flatMap((region) =>
            region.city === city && region.district ? [region.district] : [],
          ),
        ),
      ).sort((a, b) => a.localeCompare(b, "tr")),
    [city, regions],
  );

  const contributorState = city ? localLeaderboard : globalLeaderboard;
  const activeTab = leaderboardTabs.find((tab) => tab.value === period);

  function handleCityChange(nextCity: string) {
    setCity(nextCity);
    setDistrict("");
  }

  return (
    <>
      <GlassPanel className="p-2">
        <div
          aria-label="Sıralama görünümü"
          className="grid grid-cols-2 gap-1.5"
          role="tablist"
        >
          <ViewButton
            icon={<Users className="size-4" />}
            isSelected={view === "contributors"}
            label="Katkıcılar"
            onClick={() => setView("contributors")}
          />
          <ViewButton
            icon={<Building2 className="size-4" />}
            isSelected={view === "regions"}
            label="Bölgeler"
            onClick={() => setView("regions")}
          />
        </div>
      </GlassPanel>

      <GlassPanel className="p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-ink-muted">
            Şehir
            <select
              className="min-h-11 rounded-2xl border border-slate-200 bg-white/80 px-3 text-sm font-semibold text-ink outline-none transition focus:border-road-blue focus:ring-2 focus:ring-road-blue/15"
              disabled={areRegionsLoading || cities.length === 0}
              onChange={(event) => handleCityChange(event.target.value)}
              value={city}
            >
              <option value="">Tüm şehirler</option>
              {cities.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          {view === "contributors" ? (
            <label className="grid gap-1.5 text-xs font-semibold text-ink-muted">
              İlçe
              <select
                className="min-h-11 rounded-2xl border border-slate-200 bg-white/80 px-3 text-sm font-semibold text-ink outline-none transition focus:border-road-blue focus:ring-2 focus:ring-road-blue/15 disabled:opacity-55"
                disabled={!city || districts.length === 0}
                onChange={(event) => setDistrict(event.target.value)}
                value={district}
              >
                <option value="">Tüm ilçeler</option>
                {districts.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="flex min-h-11 items-end text-xs leading-5 text-ink-muted">
              Bölge sıralaması kullanıcıların aktif bildirim ve doğrulama
              katkılarını toplu olarak gösterir.
            </div>
          )}
        </div>

        {cities.length === 0 && !areRegionsLoading ? (
          <p className="mt-2 text-xs text-ink-muted">
            Şehir ve ilçe bilgisi bulunan kayıtlar oluştuğunda yerel filtreler
            kullanılabilir.
          </p>
        ) : null}
      </GlassPanel>

      {view === "contributors" ? (
        <ContributorLeaderboard
          activeTabDescription={activeTab?.description}
          city={city}
          district={district}
          error={contributorState.error}
          isLoading={contributorState.isLoading}
          onPeriodChange={setPeriod}
          period={period}
          rows={contributorState.rows}
        />
      ) : (
        <RegionalLeaderboard
          error={regionalLeaderboard.error}
          isLoading={regionalLeaderboard.isLoading}
          rows={regionalLeaderboard.rows}
        />
      )}

      <GlassPanel className="p-4 text-sm leading-6 text-ink-muted">
        Sıralamalar yalnızca kesinleşmiş ve kamuya açık katkıları kullanır.
        E-posta adresleri, kullanıcı kimlikleri ve kişisel konum geçmişi
        paylaşılmaz.
      </GlassPanel>
    </>
  );
}

function ContributorLeaderboard({
  activeTabDescription,
  city,
  district,
  error,
  isLoading,
  onPeriodChange,
  period,
  rows,
}: {
  activeTabDescription?: string;
  city: string;
  district: string;
  error: string | null;
  isLoading: boolean;
  onPeriodChange: (period: LeaderboardPeriod) => void;
  period: LeaderboardPeriod;
  rows: LeaderboardRow[];
}) {
  return (
    <>
      {!city ? (
        <GlassPanel className="p-2">
          <div
            aria-label="Katkıcı sıralaması dönemi"
            className="grid grid-cols-1 gap-1.5 sm:grid-cols-3"
            role="tablist"
          >
            {leaderboardTabs.map((tab) => (
              <button
                aria-selected={period === tab.value}
                className={cn(
                  "flex min-h-11 items-center rounded-2xl border px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
                  period === tab.value
                    ? "border-road-blue bg-white text-ink shadow-sm"
                    : "border-slate-200 bg-white/55 text-ink-muted hover:bg-white",
                )}
                key={tab.value}
                onClick={() => onPeriodChange(tab.value)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </GlassPanel>
      ) : null}

      <p className="px-2 text-sm leading-6 text-ink-muted">
        {city
          ? `${city}${district ? ` / ${district}` : ""} için kesinleşmiş yerel katkılar.`
          : activeTabDescription ?? "Kesinleşmiş katkılar."}{" "}
        Kullanıcı adları gizlilik için kısaltılmıştır.
      </p>

      <LeaderboardState
        empty="Bu bölgede sıralanacak kesinleşmiş katkı yok."
        error={error}
        isEmpty={rows.length === 0}
        isLoading={isLoading}
        loading="Katkıcı sıralaması yükleniyor..."
      />

      {!isLoading && !error && rows.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <IndividualCard
              key={`${city || period}-${row.rank}-${row.user_public_code}`}
              locationLabel={
                city ? `${city}${district ? ` / ${district}` : ""}` : null
              }
              row={row}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function RegionalLeaderboard({
  error,
  isLoading,
  rows,
}: {
  error: string | null;
  isLoading: boolean;
  rows: RegionalLeaderboardRow[];
}) {
  return (
    <>
      <p className="px-2 text-sm leading-6 text-ink-muted">
        İlçeler aktif bildirim sayısına göre sıralanır; doğrulama ve çözüm
        verileri ayrıca gösterilir.
      </p>

      <LeaderboardState
        empty="Henüz sıralanacak şehir veya ilçe verisi yok."
        error={error}
        isEmpty={rows.length === 0}
        isLoading={isLoading}
        loading="Bölge sıralaması yükleniyor..."
      />

      {!isLoading && !error && rows.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <RegionalCard
              key={`${row.city}-${row.district}`}
              row={row}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function ViewButton({
  icon,
  isSelected,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  isSelected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={isSelected}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
        isSelected
          ? "border-road-blue bg-white text-ink shadow-sm"
          : "border-slate-200 bg-white/55 text-ink-muted hover:bg-white",
      )}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function LeaderboardState({
  empty,
  error,
  isEmpty,
  isLoading,
  loading,
}: {
  empty: string;
  error: string | null;
  isEmpty: boolean;
  isLoading: boolean;
  loading: string;
}) {
  if (isLoading) {
    return <GlassPanel className="p-4 text-sm text-ink-muted">{loading}</GlassPanel>;
  }
  if (error) {
    return (
      <GlassPanel className="border-red-200 bg-red-50/80 p-4 text-sm font-semibold text-red-700">
        {error}
      </GlassPanel>
    );
  }
  if (isEmpty) {
    return (
      <GlassPanel className="p-4 text-sm text-ink-muted">{empty}</GlassPanel>
    );
  }
  return null;
}

function IndividualCard({
  locationLabel,
  row,
}: {
  locationLabel: string | null;
  row: LeaderboardRow;
}) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/62 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/85 text-base font-semibold text-road-blue">
            {row.rank}
          </span>
          <PlayerAvatar
            avatarStyle={row.avatar_style}
            className="size-11"
            label={`${row.public_display_name} avatarı`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-ink">
                {row.public_display_name}
              </h2>
              {row.is_current_user ? (
                <span className="rounded-full border border-road-blue/30 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-road-blue">
                  Sen
                </span>
              ) : null}
            </div>
            <UserRankBadge className="mt-1" compact score={row.points} />
          </div>
        </div>
        <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Katkı Puanı" value={row.points} />
        <Metric
          label={locationLabel ? "Bölge" : "Dönem"}
          value={locationLabel ?? getLeaderboardPeriodLabel(row.period)}
        />
      </div>
    </article>
  );
}

function RegionalCard({ row }: { row: RegionalLeaderboardRow }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/62 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-base font-semibold text-road-blue">
          {row.rank}
        </span>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white/85 text-road-blue">
          <MapPinned className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">
            {row.district}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">{row.city}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Aktif bildirim" value={row.total_reports} />
        <Metric label="Doğrulama" value={row.total_verified} />
        <Metric label="Çözülen sorun" value={row.total_resolved} />
        <Metric label="Sorun noktası" value={row.total_issues} />
      </div>
      {row.total_resolved > 0 ? (
        <p className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {row.total_resolved} sorun çözüldü olarak kaydedildi.
        </p>
      ) : null}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white/64 px-3 py-2.5">
      <p className="truncate text-lg font-semibold leading-none text-ink">
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">{label}</p>
    </div>
  );
}
