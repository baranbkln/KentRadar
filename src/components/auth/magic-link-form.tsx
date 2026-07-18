"use client";

import { useMemo, useState } from "react";
import { useMagicLinkAuth } from "@/hooks/use-magic-link-auth";
import { createOptionalClient } from "@/lib/supabase/browser";
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
  const supabase = useMemo(() => createOptionalClient(), []);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
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
  const isSubmitDisabled = loading || isCoolingDown || googleLoading;

  const handleGoogleLogin = async () => {
    setGoogleError(null);

    if (!supabase) {
      setGoogleError("Google ile giriş başlatılırken hata oluştu.");
      return;
    }

    setGoogleLoading(true);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("Google OAuth error", oauthError);
      }

      setGoogleError("Google ile giriş başlatılırken hata oluştu.");
      setGoogleLoading(false);
    }
  };

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
        {error || googleError ? (
          <p className="rounded-2xl border border-red-200 bg-red-50/80 px-3 py-2 text-sm font-semibold leading-5 text-red-700">
            {googleError ?? error}
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

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium text-ink-subtle">Veya</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        className="inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-ink transition hover:border-slate-300 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading || googleLoading}
        onClick={() => void handleGoogleLogin()}
        type="button"
      >
        <GoogleIcon className="size-5" />
        {googleLoading ? "Google'a yönlendiriliyor..." : "Google ile Giriş Yap"}
      </button>
    </form>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.39 13.92A6.01 6.01 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.54l3.35-2.62Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.94 12 5.94Z"
        fill="#EA4335"
      />
    </svg>
  );
}
