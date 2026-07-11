"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getIssuePublicUrl,
  getIssueShareText,
  getTwitterShareUrl,
  getWhatsAppShareUrl,
} from "@/lib/issues/issue-share";
import type { PublicIssueRankingRow } from "@/lib/road-issues/types";

type IssueShareActionsProps = {
  issue: PublicIssueRankingRow;
};

export function IssueShareActions({ issue }: IssueShareActionsProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const publicUrl = useMemo(() => getIssuePublicUrl(issue.id, origin), [issue.id, origin]);
  const shareText = getIssueShareText(issue);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function handleCopy() {
    const text = `${shareText} ${publicUrl}`;

    if (!navigator.clipboard) {
      setFeedback("Bağlantı kopyalanamadı. Tarayıcı desteği yok.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Bağlantı kopyalandı.");
    } catch {
      setFeedback("Bağlantı kopyalanamadı.");
    }
  }

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/62 p-3">
      <h2 className="text-base font-semibold text-ink">Paylaş</h2>
      <p className="mt-1 text-sm leading-5 text-ink-muted">
        Nötr bir özet bağlantısı paylaş.
      </p>
      <div className="mt-3 grid gap-2">
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
          onClick={handleCopy}
          type="button"
        >
          <Copy className="size-4" />
          Bağlantıyı kopyala
        </button>
        <a
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
          href={getWhatsAppShareUrl(issue, origin)}
          rel="noreferrer"
          target="_blank"
        >
          WhatsApp ile paylaş
          <ExternalLink className="size-4" />
        </a>
        <a
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
          href={getTwitterShareUrl(issue, origin)}
          rel="noreferrer"
          target="_blank"
        >
          X üzerinde paylaş
          <ExternalLink className="size-4" />
        </a>
      </div>
      {feedback ? (
        <p className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm font-semibold text-emerald-700">
          <Check className="size-4" />
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
