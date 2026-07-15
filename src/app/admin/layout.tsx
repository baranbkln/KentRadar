import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { GlassPanel } from "@/components/map/glass-panel";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Yönetim Paneli | YolDurumu",
  description: "YolDurumu moderasyon ve yönetim paneli.",
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, is_suspended")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin || profile.is_suspended) {
    redirect("/");
  }

  return (
    <AppShell>
      <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.18),_transparent_34%),linear-gradient(145deg,#020617,#0f172a_55%,#111827)] px-4 py-4 text-slate-100 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-4">
          <GlassPanel className="flex min-h-16 items-center justify-between gap-4 !border-white/10 !bg-slate-950/70 px-4 py-3 !shadow-2xl sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-cyan-300 ring-1 ring-inset ring-cyan-300/20">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-white">
                  Yönetim Paneli
                </p>
                <p className="truncate text-xs text-slate-400">
                  Moderasyon ve platform güvenliği
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Haritaya dön</span>
              <span className="sr-only sm:hidden">Haritaya dön</span>
            </Link>
          </GlassPanel>

          {children}
        </div>
      </main>
    </AppShell>
  );
}
