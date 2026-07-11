"use client";

import { useMagicLinkAuth } from "@/hooks/use-magic-link-auth";
import { cn } from "@/lib/utils";

type MagicLinkFormProps = {
  className?: string;
  compact?: boolean;
  defaultEmail?: string;
  description?: string;
  onSent?: (email: string) => void;
  title?: string;
};

export function MagicLinkForm({
  className,
  compact = false,
  defaultEmail,
  description,
  onSent,
  title,
}: MagicLinkFormProps) {
  const {
    cooldownSeconds,
    email,
    error,
    isCoolingDown,
    loading,
    message,
    sendMagicLink,
    setEmail,
  } = useMagicLinkAuth({ defaultEmail, onSent });
  const isSubmitDisabled = loading || isCoolingDown;

  return (
    <form
      className={cn(compact ? "space-y-2" : "space-y-3", className)}
      onSubmit={(event) => {
        event.preventDefault();
        void sendMagicLink();
      }}
    >
      {title || description ? (
        <div className={compact ? "space-y-1" : "space-y-1.5"}>
          {title ? (
            <p className="text-sm font-semibold text-ink">{title}</p>
          ) : null}
          {description ? (
            <p className="text-sm leading-5 text-ink-muted">{description}</p>
          ) : null}
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block px-1 text-[11px] font-semibold uppercase text-ink-subtle">
          E-posta adresin
        </span>
        <input
          aria-label="E-posta adresin"
          autoComplete="email"
          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 text-sm text-ink outline-none focus:border-road-blue focus:ring-2 focus:ring-road-blue/20"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ornek@eposta.com"
          type="email"
          value={email}
        />
      </label>

      <div aria-live="polite">
        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50/80 px-3 py-2 text-sm font-semibold leading-5 text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm font-semibold leading-5 text-emerald-700">
            {message}
          </p>
        ) : null}
        {isCoolingDown ? (
          <p className="mt-2 rounded-2xl border border-slate-200 bg-white/62 px-3 py-2 text-sm font-semibold leading-5 text-ink-muted">
            Tekrar göndermek için {cooldownSeconds} sn bekle.
          </p>
        ) : null}
      </div>

      <button
        className="min-h-11 w-full rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitDisabled}
        type="submit"
      >
        {loading
          ? "Gönderiliyor..."
          : isCoolingDown
            ? `Tekrar gönder (${cooldownSeconds} sn)`
            : "Giriş bağlantısı gönder"}
      </button>
    </form>
  );
}
