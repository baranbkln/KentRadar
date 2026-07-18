"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import {
  PlayerAvatar,
  playerAvatarOptions,
  type AvatarStyle,
} from "@/components/profile/player-avatar";
import { createOptionalClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type ProfileSetupModalProps = {
  authStatus: "loading" | "authenticated" | "unauthenticated" | "unconfigured";
  onCompleted?: (profile: PlayerProfileIdentity) => void;
};

export type PlayerProfileIdentity = {
  username: string;
  avatarStyle: AvatarStyle;
};

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,15}$/;

export function ProfileSetupModal({
  authStatus,
  onCompleted,
}: ProfileSetupModalProps) {
  const supabase = useMemo(() => createOptionalClient(), []);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [avatarStyle, setAvatarStyle] =
    useState<AvatarStyle>("cyan_user");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!supabase || authStatus !== "authenticated") {
      setIsOpen(false);
      return;
    }

    const client = supabase;
    let isActive = true;
    setIsChecking(true);

    async function checkProfile() {
      const {
        data: { user },
      } = await client.auth.getUser();

      if (!user || !isActive) {
        setIsChecking(false);
        return;
      }

      const { data, error: profileError } = await client
        .from("profiles")
        .select("username, avatar_style")
        .eq("id", user.id)
        .maybeSingle();

      if (!isActive) return;
      setIsChecking(false);

      if (profileError) {
        if (process.env.NODE_ENV === "development") {
          console.warn("player profile check error", profileError);
        }
        return;
      }

      if (!data?.username) {
        setAvatarStyle(normalizeAvatarStyle(data?.avatar_style));
        setIsOpen(true);
      }
    }

    void checkProfile();
    return () => {
      isActive = false;
    };
  }, [authStatus, supabase]);

  const validationError = getUsernameValidationError(username);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || validationError) {
      setError(validationError ?? "Profil bağlantısı kurulamadı.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const normalizedUsername = username.trim();
    const { error: rpcError } = await supabase.rpc("update_player_profile", {
      p_avatar_style: avatarStyle,
      p_username: normalizedUsername,
    });
    setIsSubmitting(false);

    if (rpcError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("update_player_profile RPC error", rpcError);
      }
      setError(mapProfileSetupError(rpcError.message));
      return;
    }

    setIsOpen(false);
    onCompleted?.({ username: normalizedUsername, avatarStyle });
  }

  if (!isMounted || !isOpen || isChecking) return null;

  return createPortal(
    <div
      aria-labelledby="profile-setup-title"
      aria-modal="true"
      className="fixed inset-0 z-[900] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
    >
      <form
        className="w-full max-w-md rounded-[28px] border border-white/55 bg-white/88 p-5 shadow-[0_28px_90px_rgba(15,23,42,0.3)] backdrop-blur-2xl sm:p-6"
        onSubmit={handleSubmit}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/40 bg-cyan-400/12 text-cyan-700">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="profile-setup-title" className="text-xl font-semibold text-ink">
              Oyuncu profilini oluştur
            </h2>
            <p className="mt-1 text-sm leading-5 text-ink-muted">
              Katkıların için benzersiz bir ad ve avatar seç.
            </p>
          </div>
        </div>

        <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="player-username">
          Oyuncu Adı
        </label>
        <input
          aria-describedby="player-username-help"
          autoComplete="username"
          className={cn(
            "mt-2 min-h-11 w-full rounded-2xl border bg-white/75 px-4 text-sm font-semibold text-ink outline-none transition focus:ring-2 focus:ring-road-blue/30",
            username && validationError ? "border-red-300" : "border-slate-200",
          )}
          id="player-username"
          maxLength={15}
          onChange={(event) => {
            setUsername(event.target.value);
            setError(null);
          }}
          placeholder="ornek_oyuncu"
          value={username}
        />
        <p
          className={cn(
            "mt-1.5 text-xs",
            username && validationError ? "font-semibold text-red-700" : "text-ink-muted",
          )}
          id="player-username-help"
        >
          {username && validationError
            ? validationError
            : "3-15 karakter; harf, rakam ve alt çizgi kullanabilirsin."}
        </p>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-ink">Avatarını seç</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {playerAvatarOptions.map((option) => {
              const isSelected = avatarStyle === option.value;

              return (
                <button
                  aria-pressed={isSelected}
                  className={cn(
                    "relative flex min-h-[76px] items-center gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
                    isSelected
                      ? "border-road-blue bg-blue-50/80 shadow-sm"
                      : "border-slate-200 bg-white/58 hover:bg-white/85",
                  )}
                  key={option.value}
                  onClick={() => setAvatarStyle(option.value)}
                  type="button"
                >
                  <PlayerAvatar avatarStyle={option.value} />
                  <span className="text-xs font-semibold text-ink">{option.label}</span>
                  {isSelected ? (
                    <Check className="absolute right-2 top-2 size-4 text-road-blue" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div aria-live="polite" className="mt-3 min-h-5 text-xs font-semibold text-red-700">
          {error}
        </div>

        <button
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-55"
          disabled={isSubmitting || Boolean(validationError)}
          type="submit"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? "Kaydediliyor..." : "Profili tamamla"}
        </button>
      </form>
    </div>,
    document.body,
  );
}

function getUsernameValidationError(username: string) {
  const normalized = username.trim();
  if (!normalized) return "Oyuncu adı gerekli.";
  if (!USERNAME_PATTERN.test(normalized)) {
    return "3-15 karakter kullan; yalnızca harf, rakam ve alt çizgi ekle.";
  }
  return null;
}

function normalizeAvatarStyle(value: unknown): AvatarStyle {
  return playerAvatarOptions.some((option) => option.value === value)
    ? (value as AvatarStyle)
    : "cyan_user";
}

function mapProfileSetupError(message: string) {
  if (message.includes("zaten alınmış")) return "Bu kullanıcı adı zaten alınmış.";
  if (message.includes("yasaklı") || message.includes("topluluk kurallarına")) {
    return "Bu kullanıcı adı yasaklı kelime içeriyor.";
  }
  if (message.includes("3-15") || message.includes("3 ile 15")) {
    return "Kullanıcı adı 3-15 karakter arasında olmalı.";
  }
  if (message.includes("Geçersiz avatar")) return "Lütfen geçerli bir avatar seç.";
  return "Profil kaydedilirken bir hata oluştu. Lütfen tekrar dene.";
}
