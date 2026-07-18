"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createOptionalClient } from "@/lib/supabase/browser";

const SENT_COOLDOWN_SECONDS = 60;
const RATE_LIMIT_COOLDOWN_SECONDS = 180;
const STORAGE_PREFIX = "kentradar:auth:magic-link-cooldown";
const LEGACY_STORAGE_PREFIX = "yoldurumu:auth:magic-link-cooldown";

type CooldownReason = "sent" | "rate_limited";

type StoredCooldown = {
  email: string;
  reason: CooldownReason;
  until: number;
};

type UseMagicLinkAuthOptions = {
  defaultEmail?: string;
  onSent?: (email: string) => void;
};

export function useMagicLinkAuth({
  defaultEmail = "",
  onSent,
}: UseMagicLinkAuthOptions = {}) {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = normalizeEmail(email);
  const cooldownSeconds =
    cooldownUntil === null
      ? 0
      : Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const isCoolingDown = cooldownSeconds > 0;

  const clearMessage = useCallback(() => {
    setMessage(null);
    setError(null);
  }, []);

  const storeCooldown = useCallback(
    (targetEmail: string, seconds: number, reason: CooldownReason) => {
      const until = Date.now() + seconds * 1000;
      const value: StoredCooldown = {
        email: targetEmail,
        reason,
        until,
      };

      setCooldownUntil(until);
      setNow(Date.now());

      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.setItem(storageKey(targetEmail), JSON.stringify(value));
    },
    [],
  );

  const sendMagicLink = useCallback(async () => {
    const targetEmail = normalizeEmail(email);

    setMessage(null);
    setError(null);

    if (!isValidEmail(targetEmail)) {
      setError("Lütfen geçerli bir e-posta adresi gir.");
      return;
    }

    const storedCooldown = readStoredCooldown(targetEmail);

    if (storedCooldown) {
      setCooldownUntil(storedCooldown.until);
      setNow(Date.now());
      setStoredCooldownMessage(storedCooldown.reason, setMessage, setError);
      return;
    }

    if (!supabase) {
      setError("Giriş bağlantısı gönderilirken hata oluştu.");
      return;
    }

    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: {
        emailRedirectTo:
          typeof window === "undefined" ? undefined : window.location.origin,
      },
    });

    setLoading(false);

    if (authError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("Magic link auth error", authError);
      }

      if (isRateLimitError(authError)) {
        storeCooldown(
          targetEmail,
          RATE_LIMIT_COOLDOWN_SECONDS,
          "rate_limited",
        );
        setError(
          "Çok kısa sürede fazla giriş bağlantısı istendi. Lütfen birkaç dakika sonra tekrar dene.",
        );
        return;
      }

      setError("Giriş bağlantısı gönderilirken hata oluştu.");
      return;
    }

    storeCooldown(targetEmail, SENT_COOLDOWN_SECONDS, "sent");
    setMessage("Giriş bağlantısı e-posta adresine gönderildi.");
    onSent?.(targetEmail);
  }, [email, onSent, storeCooldown, supabase]);

  useEffect(() => {
    if (!normalizedEmail) {
      setCooldownUntil(null);
      return;
    }

    const storedCooldown = readStoredCooldown(normalizedEmail);
    setCooldownUntil(storedCooldown?.until ?? null);
    setNow(Date.now());

    if (storedCooldown) {
      setStoredCooldownMessage(storedCooldown.reason, setMessage, setError);
    }
  }, [normalizedEmail]);

  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }

    const interval = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);

      if (cooldownUntil <= nextNow) {
        if (normalizedEmail) {
          window.localStorage.removeItem(storageKey(normalizedEmail));
          window.localStorage.removeItem(legacyStorageKey(normalizedEmail));
        }

        setCooldownUntil(null);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [cooldownUntil, normalizedEmail]);

  return {
    clearMessage,
    cooldownSeconds,
    email,
    error,
    isCoolingDown,
    loading,
    message,
    sendMagicLink,
    setEmail,
  };
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function storageKey(email: string) {
  return `${STORAGE_PREFIX}:${email}`;
}

function legacyStorageKey(email: string) {
  return `${LEGACY_STORAGE_PREFIX}:${email}`;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readStoredCooldown(email: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const currentStorageKey = storageKey(email);
  const previousStorageKey = legacyStorageKey(email);
  const rawValue =
    window.localStorage.getItem(currentStorageKey) ??
    window.localStorage.getItem(previousStorageKey);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<StoredCooldown>;

    if (
      parsedValue.email !== email ||
      typeof parsedValue.until !== "number" ||
      (parsedValue.reason !== "sent" &&
        parsedValue.reason !== "rate_limited")
    ) {
      window.localStorage.removeItem(currentStorageKey);
      window.localStorage.removeItem(previousStorageKey);
      return null;
    }

    if (parsedValue.until <= Date.now()) {
      window.localStorage.removeItem(currentStorageKey);
      window.localStorage.removeItem(previousStorageKey);
      return null;
    }

    window.localStorage.setItem(currentStorageKey, rawValue);
    window.localStorage.removeItem(previousStorageKey);
    return parsedValue as StoredCooldown;
  } catch {
    window.localStorage.removeItem(currentStorageKey);
    window.localStorage.removeItem(previousStorageKey);
    return null;
  }
}

function setStoredCooldownMessage(
  reason: CooldownReason,
  setMessage: (message: string | null) => void,
  setError: (message: string | null) => void,
) {
  if (reason === "rate_limited") {
    setMessage(null);
    setError(
      "Çok kısa sürede fazla giriş bağlantısı istendi. Lütfen birkaç dakika sonra tekrar dene.",
    );
    return;
  }

  setError(null);
  setMessage("Giriş bağlantısı e-posta adresine gönderildi.");
}

function isRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
  const status = Number(record.status);
  const code = String(record.code ?? "").toLowerCase();
  const message = String(record.message ?? "").toLowerCase();

  return (
    status === 429 ||
    code.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many") ||
    message.includes("over_email_send_rate_limit")
  );
}
