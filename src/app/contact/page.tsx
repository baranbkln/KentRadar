import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { GlassPanel } from "@/components/map/glass-panel";

export const metadata: Metadata = {
  title: "İletişim | YolDurumu",
  description: "YolDurumu iletişim ve destek bilgileri.",
};

export default function ContactPage() {
  return (
    <AppShell>
      <main className="flex min-h-dvh items-start px-3 py-5 text-ink md:items-center md:px-6 md:py-8">
        <GlassPanel className="mx-auto w-full max-w-3xl px-5 py-7 md:px-10 md:py-10">
          <article className="text-[15px] leading-7 text-ink-muted md:text-base md:leading-8">
            <header className="border-b border-slate-200/80 pb-6 md:pb-8">
              <p className="text-sm font-semibold text-road-blue">
                YolDurumu
              </p>
              <h1 className="mt-2 text-2xl font-semibold leading-tight text-ink md:text-3xl">
                İletişim
              </h1>
            </header>

            <section className="mt-7 md:mt-9">
              <h2 className="text-lg font-semibold text-ink">
                Bizimle iletişime geç
              </h2>
              <p className="mt-3">
                [WEBSITE_NAME] şu anda Açık Beta (Public Beta) aşamasındadır.
                Platformla ilgili geri bildirimleriniz, teknik destek
                talepleriniz, veri silme işlemleriniz veya işbirlikleri için
                bizimle aşağıdaki e-posta adresi üzerinden iletişime
                geçebilirsiniz.
              </p>

              <a
                className="mt-6 inline-flex min-h-11 items-center rounded-full border border-road-blue/25 bg-blue-50/80 px-5 font-semibold text-road-blue transition hover:border-road-blue/40 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
                href="mailto:[EMAIL_ADDRESS]"
              >
                [EMAIL_ADDRESS]
              </a>
            </section>
          </article>
        </GlassPanel>
      </main>
    </AppShell>
  );
}
