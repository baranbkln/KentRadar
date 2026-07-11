"use client";

import { Check, LocateFixed, X } from "lucide-react";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { GlassPanel } from "@/components/map/glass-panel";
import {
  categoryOptions,
  severityOptions,
  type RoadIssueCategory,
  type RoadIssueSeverity,
} from "@/lib/domain/road-issue-options";
import type { SelectedRoadIssueLocation } from "@/lib/road-issues/types";
import { cn } from "@/lib/utils";

type AddIssuePanelProps = {
  authStatus: "loading" | "authenticated" | "unauthenticated" | "unconfigured";
  category: RoadIssueCategory | "";
  error: string | null;
  hasDamage: boolean;
  isSubmitting: boolean;
  selectedLocation: SelectedRoadIssueLocation | null;
  severity: RoadIssueSeverity | "";
  success: string | null;
  onCancel: () => void;
  onCategoryChange: (category: RoadIssueCategory) => void;
  onDamageChange: (hasDamage: boolean) => void;
  onSeverityChange: (severity: RoadIssueSeverity) => void;
  onSubmit: () => void;
  onUseCurrentLocation: () => void;
};

export function AddIssuePanel({
  authStatus,
  category,
  error,
  hasDamage,
  isSubmitting,
  selectedLocation,
  severity,
  success,
  onCancel,
  onCategoryChange,
  onDamageChange,
  onSeverityChange,
  onSubmit,
  onUseCurrentLocation,
}: AddIssuePanelProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[730] p-3 pb-[max(12px,env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-5 md:left-5 md:top-28 md:w-[390px]">
      <GlassPanel className="pointer-events-auto max-h-[72dvh] overflow-y-auto p-3.5 md:max-h-full md:p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">
              Yol sorunu bildir
            </h2>
            <p className="mt-1 text-sm leading-5 text-ink-muted">
              Haritadan konum seç. Bir sorun türü ve önem seviyesi seç.
            </p>
          </div>
          <button
            aria-label="Vazgeç"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/72 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
            onClick={onCancel}
            type="button"
          >
            <X className="size-5" />
          </button>
        </div>

        {authStatus !== "authenticated" ? (
          <AuthPrompt
            authStatus={authStatus}
            onCancel={onCancel}
          />
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white/62 p-3">
              <p className="text-[11px] font-semibold uppercase text-ink-subtle">
                Seçilen konum
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {selectedLocation
                  ? `${selectedLocation.latitude.toFixed(5)}, ${selectedLocation.longitude.toFixed(5)}`
                  : "Henüz konum seçilmedi"}
              </p>
              <button
                className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
                onClick={onUseCurrentLocation}
                type="button"
              >
                <LocateFixed className="size-4" />
                Mevcut konumumu kullan
              </button>
            </div>

            <OptionGroup
              label="Sorun türü"
              options={categoryOptions}
              value={category}
              onChange={(value) => onCategoryChange(value as RoadIssueCategory)}
            />
            <OptionGroup
              label="Önem seviyesi"
              options={severityOptions}
              value={severity}
              onChange={(value) => onSeverityChange(value as RoadIssueSeverity)}
            />

            <label className="flex min-h-11 items-start gap-3 rounded-2xl border border-slate-200 bg-white/62 p-3 text-sm text-ink">
              <input
                checked={hasDamage}
                className="mt-1 size-4 accent-road-blue"
                onChange={(event) => onDamageChange(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-semibold">Araç hasarı yaşadım</span>
                <span className="mt-1 block text-xs leading-5 text-ink-muted">
                  Hasar bildirimi yalnızca sayı olarak tutulur; açıklama veya
                  tazminat süreci içermez.
                </span>
              </span>
            </label>

            {error ? <Alert tone="error">{error}</Alert> : null}
            {success ? <Alert tone="success">{success}</Alert> : null}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                className="min-h-11 rounded-full border border-slate-200 bg-white/72 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
                onClick={onCancel}
                type="button"
              >
                Vazgeç
              </button>
              <button
                className="min-h-11 rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                onClick={onSubmit}
                type="button"
              >
                {isSubmitting ? "Bildiriliyor..." : "Sorunu bildir"}
              </button>
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

type OptionGroupProps = {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
};

function OptionGroup({ label, options, value, onChange }: OptionGroupProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 px-1 text-[11px] font-semibold uppercase text-ink-subtle">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((option) => {
          const isSelected = option.value === value;

          return (
            <button
              aria-pressed={isSelected}
              className={cn(
                "flex min-h-[42px] items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-left text-[12px] font-semibold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
                isSelected
                  ? "border-road-blue bg-white text-ink shadow-sm"
                  : "border-slate-200 bg-white/62 text-ink-muted hover:bg-white",
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <span className="min-w-0 break-words">{option.label}</span>
              {isSelected ? (
                <Check aria-hidden="true" className="size-3.5 shrink-0 text-road-blue" />
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function AuthPrompt({
  authStatus,
  onCancel,
}: Pick<
  AddIssuePanelProps,
  "authStatus" | "onCancel"
>) {
  if (authStatus === "loading") {
    return <p className="text-sm text-ink-muted">Oturum kontrol ediliyor...</p>;
  }

  if (authStatus === "unconfigured") {
    return (
      <div className="space-y-3">
        <Alert tone="error">
          Sorun bildirmek için Supabase bağlantısı yapılandırılmalı.
        </Alert>
        <button
          className="min-h-11 rounded-full border border-slate-200 bg-white/72 px-4 text-sm font-semibold text-ink transition hover:bg-white"
          onClick={onCancel}
          type="button"
        >
          Vazgeç
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Alert tone="error">Sorun bildirmek için giriş yapmalısın.</Alert>
      <MagicLinkForm compact />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          className="min-h-11 rounded-full border border-slate-200 bg-white/72 px-4 text-sm font-semibold text-ink transition hover:bg-white"
          onClick={onCancel}
          type="button"
        >
          Vazgeç
        </button>
      </div>
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
        "rounded-2xl px-3 py-2 text-sm leading-5",
        tone === "error"
          ? "bg-red-50 text-red-700"
          : "bg-emerald-50 text-emerald-700",
      )}
    >
      {children}
    </p>
  );
}
