"use client";

import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { useIssueWatch } from "@/hooks/use-issue-watch";
import { cn } from "@/lib/utils";

type IssueWatchButtonProps = {
  issueId: string;
  initialWatcherCount?: number | null;
  compact?: boolean;
  hideCount?: boolean;
  hideInlineMessages?: boolean;
  showDescription?: boolean;
  onFeedback?: (message: string, tone: "error" | "success") => void;
};

export function IssueWatchButton({
  issueId,
  initialWatcherCount,
  compact = false,
  hideCount = false,
  hideInlineMessages = false,
  onFeedback,
  showDescription = false,
}: IssueWatchButtonProps) {
  const {
    authStatus,
    error,
    isLoading,
    isWatching,
    toggleWatch,
    watcherCount,
  } = useIssueWatch(issueId, initialWatcherCount);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isAuthPromptVisible, setIsAuthPromptVisible] = useState(false);

  useEffect(() => {
    if (hideInlineMessages && error) {
      onFeedback?.("İşlem yapılamadı.", "error");
    }
  }, [error, hideInlineMessages, onFeedback]);

  async function handleToggleWatch() {
    setFeedback(null);

    if (authStatus !== "authenticated") {
      setIsAuthPromptVisible(true);
      onFeedback?.("Giriş yapmalısın.", "error");
      return;
    }

    const wasWatching = isWatching;
    const result = await toggleWatch();

    if (result) {
      setIsAuthPromptVisible(false);
      const message = wasWatching
        ? "Takipten çıkarıldı."
        : "Takip listene eklendi.";
      setFeedback(message);
      onFeedback?.(message, "success");
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white/62",
        compact ? "border-0 bg-transparent p-0" : "p-3",
      )}
    >
      {showDescription ? (
        <div className="mb-3">
          <h2 className="text-base font-semibold text-ink">
            {isWatching ? "Bu sorunu takip ediyorsun" : "Bu sorunu takip et"}
          </h2>
          <p className="mt-1 text-sm leading-5 text-ink-muted">
            Gelecekteki güncellemeleri takip listende görebilirsin.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label={isWatching ? "Takip ediliyor, takipten çık" : "Bu sorunu takip et"}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue disabled:cursor-not-allowed disabled:opacity-60",
            isWatching
              ? "border border-emerald-200 bg-emerald-50/85 text-emerald-800 hover:bg-emerald-50"
              : "bg-road-blue text-white hover:bg-blue-700",
            "w-full",
          )}
          disabled={isLoading || authStatus === "loading"}
          onClick={handleToggleWatch}
          type="button"
        >
          {isWatching ? <Check className="size-4" /> : <Bell className="size-4" />}
          {isLoading
            ? "Güncelleniyor..."
            : isWatching
              ? "Takip ediliyor"
              : compact
                ? "Takip et"
                : "Bu sorunu takip et"}
        </button>
      </div>

      {hideCount ? null : (
        <p className="mt-1.5 min-h-4 text-xs font-semibold text-ink-subtle">
          {typeof watcherCount === "number" && watcherCount > 0
            ? `${watcherCount} kişi takip ediyor`
            : "\u00a0"}
        </p>
      )}

      {!hideInlineMessages && feedback ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">
          {feedback}
        </p>
      ) : null}

      {!hideInlineMessages && error ? (
        <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>
      ) : null}

      {isAuthPromptVisible && authStatus !== "authenticated" ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white/70 p-3">
          <p className="mb-3 text-sm font-semibold text-ink">
            Bu sorunu takip etmek için giriş yapmalısın.
          </p>
          <MagicLinkForm compact title="Giriş yap" />
        </div>
      ) : null}
    </div>
  );
}
