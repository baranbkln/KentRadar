"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, LoaderCircle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { createOptionalClient } from "@/lib/supabase/browser";

export type ModerationTargetType = "user" | "issue";

type ReportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  targetId: string | null;
  targetType: ModerationTargetType;
  targetLabel?: string;
};

const reportReasons = [
  "Uygunsuz Kullanıcı Adı / Topluluk Kurallarına Aykırı",
  "Sahte/Manipülatif İçerik",
  "Bölücü / Siyasi Propaganda",
] as const;

export function ReportDialog({
  isOpen,
  onClose,
  targetId,
  targetType,
  targetLabel,
}: ReportDialogProps) {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [isMounted, setIsMounted] = useState(false);
  const [reason, setReason] = useState<(typeof reportReasons)[number]>(reportReasons[0]);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    setDescription("");
    setReason(reportReasons[0]);
    setError(null);
    setSuccess(null);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedDescription = description.trim();

    if (normalizedDescription.length < 10) {
      setError("Açıklama en az 10 karakter olmalı.");
      return;
    }
    if (!supabase || !targetId) {
      setError("Rapor göndermek için giriş yapmalısın.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsSubmitting(false);
      setError("Rapor göndermek için giriş yapmalısın.");
      return;
    }

    const { error: insertError } = await supabase.from("moderation_reports").insert({
      description: normalizedDescription,
      reason,
      reporter_id: user.id,
      target_id: targetId,
      target_type: targetType,
    });
    setIsSubmitting(false);

    if (insertError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("moderation report insert error", insertError);
      }
      setError("Rapor gönderilirken bir hata oluştu. Lütfen tekrar dene.");
      return;
    }

    setSuccess("Rapor inceleme için gönderildi.");
  }

  if (!isMounted || !isOpen) return null;

  return createPortal(
    <div
      aria-labelledby="moderation-report-title"
      aria-modal="true"
      className="fixed inset-0 z-[920] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <div className="w-full max-w-md rounded-[28px] border border-white/55 bg-white/92 p-5 shadow-[0_28px_90px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-red-200 bg-red-50 text-red-700">
              <Flag className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id="moderation-report-title" className="text-lg font-semibold text-ink">
                Topluluk raporu
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {targetLabel ? `${targetLabel} için` : "Seçili içerik için"} inceleme isteği gönder.
              </p>
            </div>
          </div>
          <button
            aria-label="Rapor penceresini kapat"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white/75 text-ink-muted transition hover:bg-white hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {success ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/85 p-4 text-sm font-semibold text-emerald-800">
            {success}
            <button
              className="mt-3 min-h-11 w-full rounded-full bg-emerald-700 px-4 text-sm font-semibold text-white"
              onClick={onClose}
              type="button"
            >
              Kapat
            </button>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-semibold text-ink" htmlFor="report-reason">
              Gerekçe
            </label>
            <select
              className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-road-blue/30"
              id="report-reason"
              onChange={(event) => setReason(event.target.value as (typeof reportReasons)[number])}
              value={reason}
            >
              {reportReasons.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            <div>
              <label className="block text-sm font-semibold text-ink" htmlFor="report-description">
                Açıklama
              </label>
              <textarea
                className="mt-2 min-h-28 w-full resize-none rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-road-blue/30"
                id="report-description"
                maxLength={1000}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setError(null);
                }}
                placeholder="İncelemeye yardımcı olacak kısa ve tarafsız bir açıklama yaz."
                value={description}
              />
              <p className="mt-1 text-right text-xs text-ink-muted">{description.trim().length} / 1000</p>
            </div>

            <div aria-live="polite" className="min-h-5 text-xs font-semibold text-red-700">
              {error}
            </div>

            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-55"
              disabled={isSubmitting || description.trim().length < 10}
              type="submit"
            >
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Flag className="size-4" aria-hidden="true" />}
              {isSubmitting ? "Gönderiliyor..." : "Raporu gönder"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
