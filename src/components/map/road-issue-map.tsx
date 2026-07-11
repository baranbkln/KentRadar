"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import { AppShell } from "@/components/layout/app-shell";
import { AddIssuePanel } from "@/components/map/add-issue-panel";
import { CurrentLocationMarker } from "@/components/map/current-location-marker";
import { IssueBottomSheet } from "@/components/map/issue-bottom-sheet";
import { IssueRankingPreview } from "@/components/map/issue-ranking-preview";
import { IssueSidePanel } from "@/components/map/issue-side-panel";
import { MapAddClickHandler } from "@/components/map/map-add-click-handler";
import { MapControlBar } from "@/components/map/map-control-bar";
import { MapStatusOverlay } from "@/components/map/map-status-overlay";
import { ProfilePreview } from "@/components/map/profile-preview";
import { RoadIssueMarker } from "@/components/map/road-issue-marker";
import { SelectedLocationMarker } from "@/components/map/selected-location-marker";
import { useAccountSummary } from "@/hooks/use-account-summary";
import { useRoadIssues } from "@/hooks/use-road-issues";
import type {
  RoadIssueCategory,
  RoadIssueSeverity,
} from "@/lib/domain/road-issue-options";
import type { BrowserLocation } from "@/lib/geo/location";
import {
  calculateDistanceMeters,
  getCurrentPosition,
  getLocationErrorMessage,
} from "@/lib/geo/location";
import type {
  CreateIssueOrMergeDuplicateResult,
  IssueActionFeedback,
  IssueActionType,
  IssueUserState,
  PublicIssueRankingType,
  PublicRoadIssue,
  RoadIssueFilters,
  SelectedRoadIssueLocation,
} from "@/lib/road-issues/types";
import { createOptionalClient } from "@/lib/supabase/browser";

const ANKARA_CENTER: [number, number] = [39.9334, 32.8597];
const DEFAULT_ZOOM = 12;
const ISSUE_ACTION_RANGE_METERS = 500;

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "unconfigured";

export function RoadIssueMap() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createOptionalClient(), []);
  const [filters, setFilters] = useState<RoadIssueFilters>({
    categories: [],
    status: "all",
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<PublicRoadIssue | null>(
    null,
  );
  const [currentLocation, setCurrentLocation] =
    useState<BrowserLocation | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedRoadIssueLocation | null>(null);
  const [category, setCategory] = useState<RoadIssueCategory | "">("");
  const [severity, setSeverity] = useState<RoadIssueSeverity | "">("");
  const [hasDamage, setHasDamage] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    supabase ? "loading" : "unconfigured",
  );
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthPanelOpen, setIsAuthPanelOpen] = useState(false);
  const [isIssueRankingPreviewOpen, setIsIssueRankingPreviewOpen] =
    useState(false);
  const [isProfilePreviewOpen, setIsProfilePreviewOpen] = useState(false);
  const [issueRankingPreviewType, setIssueRankingPreviewType] =
    useState<PublicIssueRankingType>("most_reported");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingIssueAction, setLoadingIssueAction] =
    useState<IssueActionType | null>(null);
  const [issueActionFeedback, setIssueActionFeedback] =
    useState<IssueActionFeedback | null>(null);
  const [issueUserState, setIssueUserState] = useState<IssueUserState | null>(
    null,
  );
  const [isIssueActionAuthPromptVisible, setIsIssueActionAuthPromptVisible] =
    useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const handledIssueParamRef = useRef<string | null>(null);
  const { issues, filteredIssues, isLoading, error, refetch } =
    useRoadIssues(filters);
  const {
    isLoadingSummary: isAccountSummaryLoading,
    loadSummary: loadAccountSummary,
    resetSummary: resetAccountSummary,
    summary: accountSummary,
    summaryError: accountSummaryError,
  } = useAccountSummary(supabase);

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
      setUserEmail(data.session?.user.email ?? null);
    }

    void loadSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setAuthStatus(session ? "authenticated" : "unauthenticated");
      setUserEmail(session?.user.email ?? null);

      if (session) {
        setIsAuthPanelOpen(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (authStatus === "authenticated") {
      void loadAccountSummary();
      return;
    }

    resetAccountSummary();
  }, [authStatus, loadAccountSummary, resetAccountSummary]);

  const loadIssueUserState = useCallback(
    async (issueId: string) => {
      if (!supabase || authStatus !== "authenticated") {
        return null;
      }

      const { data, error: rpcError } = await supabase.rpc(
        "get_issue_user_state",
        {
          p_issue_id: issueId,
        },
      );

      if (rpcError) {
        if (process.env.NODE_ENV === "development") {
          console.error("get_issue_user_state RPC error", rpcError);
        }

        return null;
      }

      return parseIssueUserState(data);
    },
    [authStatus, supabase],
  );

  useEffect(() => {
    if (!selectedIssue || authStatus !== "authenticated" || !supabase) {
      setIssueUserState(null);
      return;
    }

    let isMounted = true;
    const issueId = selectedIssue.id;

    async function loadState() {
      const state = await loadIssueUserState(issueId);

      if (isMounted) {
        setIssueUserState(state);
      }
    }

    void loadState();

    return () => {
      isMounted = false;
    };
  }, [authStatus, loadIssueUserState, selectedIssue, supabase]);

  const hasActiveFilters =
    filters.categories.length > 0 || filters.status !== "all";

  useEffect(() => {
    const issueId = searchParams.get("issue");

    if (!issueId || isLoading || error) {
      return;
    }

    if (handledIssueParamRef.current === issueId) {
      return;
    }

    handledIssueParamRef.current = issueId;
    const issue = issues.find((item) => item.id === issueId);

    if (!issue) {
      setLocationMessage("Bu yol sorunu artık aktif haritada görünmüyor.");
      return;
    }

    setSelectedIssue(issue);
    setFilters({ categories: [], status: "all" });
    mapRef.current?.flyTo([issue.latitude, issue.longitude], 17, {
      duration: 0.7,
    });
  }, [error, isLoading, issues, searchParams]);

  const statusOverlay = useMemo(() => {
    if (isLoading) {
      return {
        title: "Yol sorunları yükleniyor",
        body: "Harita verileri hazırlanıyor.",
      };
    }

    if (error) {
      return {
        title: "Veri bağlantısı hazır değil",
        body: error,
      };
    }

    if (issues.length === 0) {
      return {
        title: "Henüz yol sorunu yok",
        body: "Kayıt geldiğinde haritada pin olarak görünecek.",
      };
    }

    if (filteredIssues.length === 0 && hasActiveFilters) {
      return {
        title: "Bu filtrelerde kayıt yok",
        body: "Kategori veya durum filtresini değiştirerek tekrar deneyebilirsin.",
      };
    }

    return null;
  }, [error, filteredIssues.length, hasActiveFilters, isLoading, issues.length]);

  function handleIssueSelect(issue: PublicRoadIssue) {
    setSelectedIssue(issue);
    setIssueActionFeedback(null);
    setIsIssueActionAuthPromptVisible(false);
    setIsIssueRankingPreviewOpen(false);
    setIsProfilePreviewOpen(false);
    setIsFilterOpen(false);
    mapRef.current?.flyTo([issue.latitude, issue.longitude], 17, {
      duration: 0.6,
    });
  }

  async function handleUseLocation() {
    setLocationMessage("Konum izni bekleniyor...");

    try {
      const location = await getCurrentPosition();
      const center: [number, number] = [location.latitude, location.longitude];

      setCurrentLocation(location);
      mapRef.current?.flyTo(center, 17, { duration: 0.8 });
      setLocationMessage("Konumun gösteriliyor.");
    } catch (locationError) {
      setLocationMessage(getLocationErrorMessage(locationError));
    }
  }

  function handleStartAddIssue() {
    setIsAddMode(true);
    setIsIssueRankingPreviewOpen(false);
    setIsProfilePreviewOpen(false);
    setSelectedIssue(null);
    setIsFilterOpen(false);
    setAddError(null);
    setAddSuccess(null);
    setLocationMessage(null);
  }

  async function handleOpenIssueFromPreview(issueId: string) {
    setIsIssueRankingPreviewOpen(false);
    setIsProfilePreviewOpen(false);
    setIssueActionFeedback(null);
    setIsIssueActionAuthPromptVisible(false);
    setLocationMessage(null);

    let issue = issues.find((item) => item.id === issueId);

    if (!issue) {
      const latestIssues = await refetch();
      issue = latestIssues.find((item) => item.id === issueId);
    }

    if (!issue) {
      setLocationMessage("Bu yol sorunu artık aktif haritada görünmüyor.");
      return;
    }

    setSelectedIssue(issue);
    mapRef.current?.flyTo([issue.latitude, issue.longitude], 17, {
      duration: 0.6,
    });
  }

  function handleCancelAddIssue() {
    setIsAddMode(false);
    setSelectedLocation(null);
    setCategory("");
    setSeverity("");
    setHasDamage(false);
    setAddError(null);
    setAddSuccess(null);
    setIsSubmitting(false);
  }

  function handleSelectIssueLocation(location: SelectedRoadIssueLocation) {
    setSelectedLocation(location);
    setAddError(null);
    mapRef.current?.flyTo([location.latitude, location.longitude], 17, {
      duration: 0.45,
    });
  }

  async function handleUseCurrentLocationForIssue() {
    setAddError(null);

    try {
      const location = await getCurrentPosition();

      setCurrentLocation(location);
      handleSelectIssueLocation(location);
    } catch (locationError) {
      setAddError(getLocationErrorMessage(locationError));
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setAuthStatus("unauthenticated");
    setUserEmail(null);
    setIssueUserState(null);
    setIsProfilePreviewOpen(false);
    setIsAuthPanelOpen(true);
    resetAccountSummary();
  }

  async function handleSubmitIssue() {
    if (authStatus !== "authenticated") {
      setAddError("Sorun bildirmek için giriş yapmalısın.");
      return;
    }

    if (!selectedLocation) {
      setAddError("Lütfen haritadan bir konum seç.");
      return;
    }

    if (!category) {
      setAddError("Lütfen sorun türünü seç.");
      return;
    }

    if (!severity) {
      setAddError("Lütfen önem seviyesini seç.");
      return;
    }

    if (!supabase) {
      setAddError("Sorun bildirilirken bir hata oluştu. Lütfen tekrar dene.");
      return;
    }

    setIsSubmitting(true);
    setAddError(null);
    setAddSuccess(null);

    const { data, error: rpcError } = await supabase.rpc(
      "create_issue_or_merge_duplicate",
      {
        p_category: category,
        p_has_photo: false,
        p_has_damage: hasDamage,
        p_latitude: selectedLocation.latitude,
        p_longitude: selectedLocation.longitude,
        p_severity: severity,
      },
    );

    if (rpcError) {
      if (process.env.NODE_ENV === "development") {
        console.error("create_issue_or_merge_duplicate RPC error", rpcError);
      }

      setIsSubmitting(false);
      setAddError(mapCreateIssueError(rpcError.message));
      return;
    }

    const result = parseCreateIssueResult(data);

    if (!result) {
      setIsSubmitting(false);
      setAddError("Sorun bildirilirken bir hata oluştu. Lütfen tekrar dene.");
      return;
    }

    const latestIssues = await refetch();
    const reportedIssue = latestIssues.find((issue) => issue.id === result.issue_id);
    const successMessage = getCreateIssueSuccessMessage(result);

    let message = result.damage_report_added
      ? `${successMessage} Araç hasarı bildirimi de eklendi.`
      : successMessage;

    if (reportedIssue) {
      const isVisible = isIssueVisibleWithFilters(reportedIssue, filters);

      if (!isVisible) {
        setFilters({ categories: [], status: "all" });
        message = `${successMessage} Kayıt görünür olsun diye filtreler temizlendi.`;
      }

      setSelectedIssue(reportedIssue);
      mapRef.current?.flyTo([reportedIssue.latitude, reportedIssue.longitude], 17, {
        duration: 0.65,
      });
    } else {
      mapRef.current?.flyTo([result.latitude, result.longitude], 17, {
        duration: 0.65,
      });
    }

    setIsSubmitting(false);
    setIsAddMode(false);
    setSelectedLocation(null);
    setCategory("");
    setSeverity("");
    setHasDamage(false);
    setAddSuccess(null);
    setAddError(null);
    setLocationMessage(message);
  }

  async function handleIssueAction(
    action: IssueActionType,
    issue: PublicRoadIssue,
  ) {
    if (authStatus !== "authenticated") {
      setIsIssueActionAuthPromptVisible(true);
      setIssueActionFeedback({
        message: "Bu işlem için giriş yapmalısın.",
        tone: "error",
      });
      return;
    }

    if (!supabase) {
      setIssueActionFeedback({
        message: "İşlem yapılırken bir hata oluştu. Lütfen tekrar dene.",
        tone: "error",
      });
      return;
    }

    if (action === "verify" && issueUserState?.has_active_report) {
      setIssueActionFeedback({
        message: "Bu sorunu zaten bildirdin.",
        tone: "error",
      });
      return;
    }

    if (action === "verify" && issueUserState?.has_verified) {
      setIssueActionFeedback({
        message: "Bu yol sorununu yakın zamanda doğruladın.",
        tone: "error",
      });
      return;
    }

    if (action === "damage" && issueUserState?.has_damage_report) {
      setIssueActionFeedback({
        message: "Bu yol sorunu için araç hasarını zaten bildirdin.",
        tone: "error",
      });
      return;
    }

    setLoadingIssueAction(action);
    setIssueActionFeedback(null);
    setIsIssueActionAuthPromptVisible(false);

    const isToggleOffAction =
      (action === "solved" && issueUserState?.has_solved_report) ||
      (action === "false_report" && issueUserState?.has_false_report);
    let location: BrowserLocation = {
      accuracyMeters: null,
      latitude: issue.latitude,
      longitude: issue.longitude,
    };

    if (!isToggleOffAction) {
      try {
        location = await getCurrentPosition();
        setCurrentLocation(location);
      } catch (locationError) {
        setLoadingIssueAction(null);
        setIssueActionFeedback({
          message:
            action === "damage"
              ? `${getLocationErrorMessage(locationError)} Araç hasarı bildirimi için konum bilgisi gerekli.`
              : getLocationErrorMessage(locationError),
          tone: "error",
        });
        return;
      }
    }

    if (action !== "damage" && !isToggleOffAction) {
      const distanceMeters = calculateDistanceMeters(location, issue);

      if (distanceMeters > ISSUE_ACTION_RANGE_METERS) {
        setLoadingIssueAction(null);
        setIssueActionFeedback({
          message: getProximityMessage(action),
          tone: "error",
        });
        return;
      }
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc(getRpcName(action), {
      p_issue_id: issue.id,
      p_latitude: location.latitude,
      p_longitude: location.longitude,
    });

    if (rpcError) {
      if (process.env.NODE_ENV === "development") {
        console.error(`${getRpcName(action)} RPC error`, rpcError);
      }

      setLoadingIssueAction(null);
      setIssueActionFeedback({
        message: mapIssueActionError(action, rpcError.message),
        tone: "error",
      });
      return;
    }

    const latestIssues = await refetch();
    const updatedIssue = latestIssues.find((item) => item.id === issue.id);

    if (updatedIssue) {
      setSelectedIssue(updatedIssue);
    }

    setLoadingIssueAction(null);
    setIssueActionFeedback({
      message:
        getIssueActionResultMessage(rpcData) ?? getIssueActionSuccessMessage(action),
      tone: "success",
    });
    setIssueUserState(await loadIssueUserState(issue.id));
  }

  async function handleWithdrawIssueReport(issue: PublicRoadIssue) {
    if (authStatus !== "authenticated") {
      setIsIssueActionAuthPromptVisible(true);
      setIssueActionFeedback({
        message: "Bu işlem için giriş yapmalısın.",
        tone: "error",
      });
      return;
    }

    if (!supabase) {
      setIssueActionFeedback({
        message: "İşlem yapılırken bir hata oluştu. Lütfen tekrar dene.",
        tone: "error",
      });
      return;
    }

    setLoadingIssueAction("withdraw");
    setIssueActionFeedback(null);

    const { error: rpcError } = await supabase.rpc("withdraw_issue_report", {
      p_issue_id: issue.id,
    });

    if (rpcError) {
      if (process.env.NODE_ENV === "development") {
        console.error("withdraw_issue_report RPC error", rpcError);
      }

      setLoadingIssueAction(null);
      setIssueActionFeedback({
        message: mapWithdrawIssueError(rpcError.message),
        tone: "error",
      });
      return;
    }

    const latestIssues = await refetch();
    const updatedIssue = latestIssues.find((item) => item.id === issue.id);

    setLoadingIssueAction(null);

    if (updatedIssue) {
      setSelectedIssue(updatedIssue);
      setIssueUserState(await loadIssueUserState(issue.id));
      setIssueActionFeedback({
        message: "Bildirimin geri çekildi.",
        tone: "success",
      });
      return;
    }

    setSelectedIssue(null);
    setIssueUserState(null);
    setLocationMessage("Bildirimin geri çekildi.");
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (selectedIssue) {
        setSelectedIssue(null);
        return;
      }

      if (isAddMode) {
        handleCancelAddIssue();
        return;
      }

      if (isProfilePreviewOpen) {
        setIsProfilePreviewOpen(false);
        return;
      }

      if (isIssueRankingPreviewOpen) {
        setIsIssueRankingPreviewOpen(false);
        return;
      }

      if (isFilterOpen) {
        setIsFilterOpen(false);
        return;
      }

      if (isAuthPanelOpen) {
        setIsAuthPanelOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isAddMode,
    isAuthPanelOpen,
    isFilterOpen,
    isIssueRankingPreviewOpen,
    isProfilePreviewOpen,
    selectedIssue,
  ]);

  return (
    <AppShell>
      <main className="relative h-dvh overflow-hidden bg-surface text-ink">
        <MapContainer
          attributionControl
          center={ANKARA_CENTER}
          className="h-full"
          ref={mapRef}
          scrollWheelZoom
          zoom={DEFAULT_ZOOM}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapKeyboardFocus />
          <MapAddClickHandler
            enabled={isAddMode && authStatus === "authenticated"}
            onSelectLocation={handleSelectIssueLocation}
          />
          {currentLocation ? (
            <CurrentLocationMarker
              accuracyMeters={currentLocation.accuracyMeters}
              latitude={currentLocation.latitude}
              longitude={currentLocation.longitude}
            />
          ) : null}
          {selectedLocation ? (
            <SelectedLocationMarker location={selectedLocation} />
          ) : null}
          {filteredIssues.map((issue) => (
            <RoadIssueMarker
              isSelected={selectedIssue?.id === issue.id}
              issue={issue}
              key={issue.id}
              onSelect={handleIssueSelect}
            />
          ))}
        </MapContainer>

        <MapControlBar
          authStatus={authStatus}
          filters={filters}
          isAuthPanelOpen={isAuthPanelOpen}
          isFilterOpen={isFilterOpen}
          isIssueRankingButtonDisabled={isAddMode}
          isIssueRankingPreviewOpen={isIssueRankingPreviewOpen}
          isProfilePreviewOpen={isProfilePreviewOpen}
          isAccountSummaryLoading={isAccountSummaryLoading}
          locationMessage={locationMessage}
          onAddIssue={handleStartAddIssue}
          onFiltersChange={setFilters}
          onFilterClose={() => setIsFilterOpen(false)}
          onSignOut={handleSignOut}
          onToggleAuthPanel={() => {
            setIsAuthPanelOpen((current) => !current);
            setIsFilterOpen(false);
            setIsIssueRankingPreviewOpen(false);
            setIsProfilePreviewOpen(false);
            setSelectedIssue(null);
            handleCancelAddIssue();
          }}
          onToggleFilters={() => {
            setIsFilterOpen((current) => !current);
            setIsIssueRankingPreviewOpen(false);
            setIsProfilePreviewOpen(false);
            setSelectedIssue(null);
            handleCancelAddIssue();
          }}
          onToggleIssueRankingPreview={() => {
            setIsIssueRankingPreviewOpen((current) => !current);
            setIsFilterOpen(false);
            setIsAuthPanelOpen(false);
            setIsProfilePreviewOpen(false);
            setSelectedIssue(null);
            handleCancelAddIssue();
          }}
          onToggleProfilePreview={() => {
            setIsProfilePreviewOpen((current) => !current);
            setIsIssueRankingPreviewOpen(false);
            setIsFilterOpen(false);
            setIsAuthPanelOpen(false);
            setSelectedIssue(null);
            handleCancelAddIssue();
          }}
          onUseLocation={handleUseLocation}
          totalCount={issues.length}
          accountSummary={accountSummary}
          userEmail={userEmail}
          visibleCount={filteredIssues.length}
        />

        {statusOverlay ? (
          <MapStatusOverlay
            body={statusOverlay.body}
            title={statusOverlay.title}
          />
        ) : null}

        {isIssueRankingPreviewOpen ? (
          <IssueRankingPreview
            rankingType={issueRankingPreviewType}
            onClose={() => setIsIssueRankingPreviewOpen(false)}
            onIssueSelect={handleOpenIssueFromPreview}
            onRankingTypeChange={setIssueRankingPreviewType}
          />
        ) : null}

        {isProfilePreviewOpen && authStatus === "authenticated" ? (
          <ProfilePreview
            accountSummary={accountSummary}
            error={accountSummaryError}
            isLoading={isAccountSummaryLoading}
            onClose={() => setIsProfilePreviewOpen(false)}
            onSignOut={handleSignOut}
            userEmail={userEmail}
          />
        ) : null}

        {isAddMode ? (
          <AddIssuePanel
            authStatus={authStatus}
            category={category}
            error={addError}
            hasDamage={hasDamage}
            isSubmitting={isSubmitting}
            onCancel={handleCancelAddIssue}
            onCategoryChange={setCategory}
            onDamageChange={setHasDamage}
            onSeverityChange={setSeverity}
            onSubmit={handleSubmitIssue}
            onUseCurrentLocation={handleUseCurrentLocationForIssue}
            selectedLocation={selectedLocation}
            severity={severity}
            success={addSuccess}
          />
        ) : null}

        {selectedIssue ? (
          <>
            <IssueSidePanel
              actionFeedback={issueActionFeedback}
              authStatus={authStatus}
              issue={selectedIssue}
              isAuthPromptVisible={isIssueActionAuthPromptVisible}
              loadingAction={loadingIssueAction}
              onAction={handleIssueAction}
              onClose={() => setSelectedIssue(null)}
              onWithdraw={handleWithdrawIssueReport}
              userState={issueUserState}
            />
            <IssueBottomSheet
              actionFeedback={issueActionFeedback}
              authStatus={authStatus}
              issue={selectedIssue}
              isAuthPromptVisible={isIssueActionAuthPromptVisible}
              loadingAction={loadingIssueAction}
              onAction={handleIssueAction}
              onClose={() => setSelectedIssue(null)}
              onWithdraw={handleWithdrawIssueReport}
              userState={issueUserState}
            />
          </>
        ) : null}
      </main>
    </AppShell>
  );
}

function isIssueVisibleWithFilters(
  issue: PublicRoadIssue,
  filters: RoadIssueFilters,
) {
  const categoryMatches =
    filters.categories.length === 0 || filters.categories.includes(issue.category);
  const statusMatches = filters.status === "all" || filters.status === issue.status;

  return categoryMatches && statusMatches;
}

function parseCreateIssueResult(
  value: unknown,
): CreateIssueOrMergeDuplicateResult | null {
  const result = Array.isArray(value) ? value[0] : value;

  if (!result || typeof result !== "object") {
    return null;
  }

  const record = result as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);

  if (
    typeof record.issue_id !== "string" ||
    typeof record.merged !== "boolean" ||
    typeof record.report_accepted !== "boolean" ||
    typeof record.already_reported_by_user !== "boolean" ||
    typeof record.severity_updated !== "boolean" ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {
    return null;
  }

    return {
      already_reported_by_user: record.already_reported_by_user,
      damage_report_added:
        typeof record.damage_report_added === "boolean"
          ? record.damage_report_added
          : false,
      issue_id: record.issue_id,
      latitude,
      longitude,
    merged: record.merged,
    report_accepted: record.report_accepted,
    severity_updated: record.severity_updated,
  };
}

function getCreateIssueSuccessMessage(result: CreateIssueOrMergeDuplicateResult) {
  if (result.already_reported_by_user) {
    return result.severity_updated
      ? "Bu yol sorununu zaten bildirdin. Önem seviyesi güncellendi."
      : "Bu yol sorununu zaten bildirdin. Mevcut sorun gösteriliyor.";
  }

  if (result.merged) {
    return "Bu noktada benzer bir sorun zaten vardı. Bildirimin mevcut soruna eklendi.";
  }

  return "Yol sorunu haritaya eklendi.";
}

function mapCreateIssueError(message: string) {
  if (message.includes("authentication_required")) {
    return "Sorun bildirmek için giriş yapmalısın.";
  }

  if (message.includes("category_required")) {
    return "Lütfen sorun türünü seç.";
  }

  if (message.includes("severity_required")) {
    return "Lütfen önem seviyesini seç.";
  }

  return "Sorun bildirilirken bir hata oluştu. Lütfen tekrar dene.";
}

function getRpcName(action: IssueActionType) {
  switch (action) {
    case "verify":
      return "verify_issue";
    case "damage":
      return "report_damage";
    case "solved":
      return "report_solved";
    case "false_report":
      return "report_false_issue";
    case "withdraw":
      return "withdraw_issue_report";
  }
}

function getIssueActionSuccessMessage(action: IssueActionType) {
  switch (action) {
    case "verify":
      return "Yol sorunu doğrulandı.";
    case "damage":
      return "Araç hasarı bildirimi eklendi.";
    case "solved":
      return "Çözüldü bildirimi alındı.";
    case "false_report":
      return "Yanlış bildirim geri bildirimi alındı.";
    case "withdraw":
      return "Bildirimin geri çekildi.";
  }
}

function getIssueActionResultMessage(value: unknown) {
  const result = Array.isArray(value) ? value[0] : value;

  if (!result || typeof result !== "object") {
    return null;
  }

  const message = (result as Record<string, unknown>).message;

  return typeof message === "string" && message.length > 0 ? message : null;
}

function getProximityMessage(action: IssueActionType) {
  switch (action) {
    case "verify":
    case "solved":
    case "false_report":
      return "Bu işlemi yapmak için sorunun yaklaşık 500 metre yakınında olmalısın.";
    case "damage":
      return "Konum bilgisi alınamadı.";
    case "withdraw":
      return "Bu işlemi yapmak için konum gerekli değil.";
  }
}

function mapIssueActionError(action: IssueActionType, message: string) {
  if (message.includes("authentication_required")) {
    return "Bu işlem için giriş yapmalısın.";
  }

  if (message.includes("proximity_required")) {
    return getProximityMessage(action);
  }

  if (message.includes("own_issue_report_exists")) {
    return "Bu sorunu zaten bildirdin.";
  }

  if (
    message.includes("recent_verification_exists") ||
    message.includes("issue_user_verifications")
  ) {
    return "Bu yol sorununu yakın zamanda doğruladın.";
  }

  if (
    action === "damage" &&
    (message.includes("damage_report_already_exists") ||
      message.includes("issue_reports_one_resolution_signal_per_user_idx"))
  ) {
    return "Bu yol sorunu için araç hasarını zaten bildirdin.";
  }

  if (
    message.includes("solved_report_already_exists") ||
    (action === "solved" &&
      message.includes("issue_reports_one_resolution_signal_per_user_idx"))
  ) {
    return "Bu yol sorunu için çözüldü bildirimi zaten alındı.";
  }

  if (
    message.includes("false_report_already_exists") ||
    (action === "false_report" &&
      message.includes("issue_reports_one_resolution_signal_per_user_idx"))
  ) {
    return "Bu yol sorunu için yanlış bildirim geri bildirimin zaten alındı.";
  }

  return "İşlem yapılırken bir hata oluştu. Lütfen tekrar dene.";
}

function mapWithdrawIssueError(message: string) {
  if (message.includes("authentication_required")) {
    return "Bu işlem için giriş yapmalısın.";
  }

  if (message.includes("no_issue_report_to_withdraw")) {
    return "Bu yol sorunu için geri çekebileceğin bir bildirimin yok.";
  }

  if (message.includes("issue_report_already_withdrawn")) {
    return "Bu bildirim zaten geri çekilmiş.";
  }

  return "İşlem yapılırken bir hata oluştu. Lütfen tekrar dene.";
}

function parseIssueUserState(value: unknown): IssueUserState | null {
  const result = Array.isArray(value) ? value[0] : value;

  if (!result || typeof result !== "object") {
    return null;
  }

  const record = result as Record<string, unknown>;

  if (
    typeof record.issue_id !== "string" ||
    typeof record.has_active_report !== "boolean" ||
    typeof record.has_withdrawn_report !== "boolean" ||
    typeof record.has_damage_report !== "boolean" ||
    typeof record.has_verified !== "boolean"
  ) {
    return null;
  }

  return {
    has_active_report: record.has_active_report,
    has_damage_report: record.has_damage_report,
    has_false_report:
      typeof record.has_false_report === "boolean"
        ? record.has_false_report
        : false,
    has_solved_report:
      typeof record.has_solved_report === "boolean"
        ? record.has_solved_report
        : false,
    has_verified: record.has_verified,
    has_withdrawn_report: record.has_withdrawn_report,
    issue_id: record.issue_id,
  };
}

function MapKeyboardFocus() {
  const map = useMap();
  map.getContainer().setAttribute("tabindex", "0");
  map.getContainer().setAttribute("aria-label", "Yol sorunu haritası");

  return null;
}
