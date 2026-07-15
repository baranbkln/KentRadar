"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ModerationReasonDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  loading: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

export function ModerationReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "danger",
  loading,
  error,
  onClose,
  onConfirm,
}: ModerationReasonDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      setReason("");
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, onClose, open]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length >= 3 && !loading;

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="moderation-dialog-title"
        className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/95 p-5 text-slate-100 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-400/10 text-amber-300">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="moderation-dialog-title" className="text-lg font-semibold">
                {title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Pencereyi kapat"
            onClick={onClose}
            disabled={loading}
            className="grid size-11 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) void onConfirm(trimmedReason);
          }}
        >
          <div>
            <label htmlFor="moderation-reason" className="text-sm font-medium">
              Gerekçe
            </label>
            <textarea
              id="moderation-reason"
              autoFocus
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Bu işlem için kısa ve açık bir gerekçe yazın."
              className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
            />
            <p className="mt-1 text-right text-xs text-slate-500">
              {reason.length}/500
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold text-slate-300 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "min-h-11 rounded-xl px-4 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-45",
                tone === "danger"
                  ? "bg-rose-600 hover:bg-rose-500 focus-visible:ring-rose-300"
                  : "bg-cyan-600 hover:bg-cyan-500 focus-visible:ring-cyan-300",
              )}
            >
              {loading ? "İşleniyor..." : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
