"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  MapPinPlus,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ONBOARDING_STORAGE_KEY = "kentradar_onboarded";
const LEGACY_ONBOARDING_STORAGE_KEY = "yoldurumu_onboarded";

const steps = [
  {
    title: "Sorun Bildir",
    description:
      "Yoldaki çukur, bozuk asfalt veya altyapı sorunlarını haritada işaretleyin.",
    icon: MapPinPlus,
    accentClassName: "bg-blue-500/15 text-blue-300 ring-blue-300/20",
  },
  {
    title: "Topluluk Doğrulasın",
    description:
      "Bildirilen sorunlar diğer gözlemciler tarafından yakından kontrol edilir ve doğrulanır.",
    icon: UsersRound,
    accentClassName: "bg-cyan-500/15 text-cyan-300 ring-cyan-300/20",
  },
  {
    title: "Sivil Etkini Gör",
    description:
      "Katkıların doğrulandıkça güven düzeyini ve çevrendeki sorunların çözüm sürecine etkini takip et.",
    icon: ShieldCheck,
    accentClassName: "bg-emerald-500/15 text-emerald-300 ring-emerald-300/20",
  },
] as const;

export function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const completeOnboarding = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } catch {
      // The modal can still close when storage is unavailable.
    }
    setIsOpen(false);
  }, []);

  useEffect(() => {
    try {
      const hasCompletedOnboarding =
        window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true" ||
        window.localStorage.getItem(LEGACY_ONBOARDING_STORAGE_KEY) === "true";

      if (hasCompletedOnboarding) {
        window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
      } else {
        setIsOpen(true);
      }
    } catch {
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") completeOnboarding();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [completeOnboarding, isOpen]);

  if (!isOpen) return null;

  const step = steps[stepIndex];
  const StepIcon = step.icon;
  const isLastStep = stepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/15 bg-slate-950/90 p-5 text-white shadow-2xl shadow-black/35 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase text-slate-400">
            KentRadar · Adım {stepIndex + 1}/{steps.length}
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Tanıtımı kapat"
            onClick={completeOnboarding}
            className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="py-7 text-center sm:py-9">
          <span
            className={cn(
              "mx-auto grid size-16 place-items-center rounded-2xl ring-1 ring-inset",
              step.accentClassName,
            )}
          >
            <StepIcon className="size-8" aria-hidden="true" />
          </span>
          <h2 id="onboarding-title" className="mt-5 text-2xl font-semibold">
            {step.title}
          </h2>
          <p
            id="onboarding-description"
            className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-300"
          >
            {step.description}
          </p>
        </div>

        <div className="mb-5 flex justify-center gap-2" aria-hidden="true">
          {steps.map((item, index) => (
            <span
              key={item.title}
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === stepIndex ? "w-8 bg-cyan-300" : "w-1.5 bg-white/20",
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={() => setStepIndex((current) => current - 1)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Geri
            </button>
          ) : (
            <button
              type="button"
              onClick={completeOnboarding}
              className="min-h-11 rounded-full px-3 text-sm font-semibold text-slate-400 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              Atla
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (isLastStep) {
                completeOnboarding();
              } else {
                setStepIndex((current) => current + 1);
              }
            }}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-cyan-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            {isLastStep ? "Keşfetmeye Başla" : "Devam"}
            {!isLastStep ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
          </button>
        </div>
      </section>
    </div>
  );
}
