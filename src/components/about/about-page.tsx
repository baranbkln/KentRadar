import { ArrowLeft, ListFilter, MapPinned, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { GlassPanel } from "@/components/map/glass-panel";

const sections = [
  {
    title: "YolDurumu nedir?",
    body: "YolDurumu, vatandaşların bozuk yol, çukur, çökmüş asfalt, rögar kapağı problemi, su birikintisi ve benzeri yol sorunlarını harita üzerinde işaretleyebildiği; diğer kullanıcıların bu sorunları doğrulayabildiği, hasar bildirebildiği, çözüldü veya yanlış/burada değil şeklinde geri bildirim verebildiği, nötr ve veri odaklı bir şehir altyapısı gözlem platformudur.",
  },
  {
    title: "Ne değildir?",
    body: "Platformun amacı bir şikayet forumu oluşturmak değildir. YolDurumu; yorum, siyasi tartışma, belediye suçlama veya kişisel itham içermeyen, tamamen harita ve veri merkezli bir yapıya sahiptir.",
  },
  {
    title: "Temel fikir",
    body: "Vatandaşlar yol sorunlarını haritada bildirir. Sistem aynı veya yakın sorunu tek bir noktada birleştirir. Diğer kullanıcılar bu sorunu yerinde doğrular, hasar bildirir veya çözüldü/yanlış bilgisini verir. Böylece zamanla şehirlerdeki yol sorunlarına dair ölçülebilir, doğrulanabilir ve kamuya açık bir veri tabanı oluşur.",
  },
  {
    title: "Uzun vadeli hedef",
    body: "YolDurumu'nun uzun vadeli hedefi yalnızca \"çukur bildirilen bir harita\" olmak değildir. Asıl hedef, kullanıcıların kendi çevrelerindeki yol sorunlarını takip ettiği, katkılarının etkisini gördüğü, düzenli olarak geri döndüğü ve şehir altyapısına dair canlı bir veri katmanı oluşturduğu bir platforma dönüşmektir.",
  },
];

export function AboutPage() {
  return (
    <AppShell>
      <main className="min-h-dvh bg-surface px-3 py-4 text-ink md:px-6 md:py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <nav className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              href="/"
            >
              <ArrowLeft className="size-4" />
              Haritaya dön
            </Link>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              href="/issues"
            >
              <ListFilter className="size-4" />
              Sorun listesine git
            </Link>
          </nav>

          <GlassPanel className="overflow-hidden p-5 md:p-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-200 bg-white/60 px-3 text-sm font-semibold text-road-blue">
                  <MapPinned className="size-4" />
                  YolDurumu
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-normal text-ink md:text-5xl">
                  Projenin Amacı
                </h1>
                <p className="mt-4 text-base leading-7 text-ink-muted md:text-lg md:leading-8">
                  YolDurumu, yol sorunlarını kişisel yorumlardan ayırarak harita,
                  doğrulama ve sayısal sinyaller üzerinden görünür hale getirmeyi
                  amaçlar.
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white/55 p-4 md:w-64">
                <p className="text-2xl font-semibold text-ink">Veri odaklı</p>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  Yorum veya tartışma yerine konum, doğrulama ve ölçülebilir
                  kullanıcı sinyalleri.
                </p>
              </div>
            </div>
          </GlassPanel>

          <div className="grid gap-3 md:grid-cols-2">
            {sections.map((section) => (
              <GlassPanel className="p-4 md:p-5" key={section.title}>
                <h2 className="text-lg font-semibold text-ink">
                  {section.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-ink-muted">
                  {section.body}
                </p>
              </GlassPanel>
            ))}
          </div>

          <GlassPanel className="border-road-blue/20 bg-blue-50/60 p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/70 text-road-blue">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  Tarafsızlık ve veri yaklaşımı
                </h2>
                <p className="mt-2 text-sm leading-7 text-ink-muted">
                  YolDurumu üzerinde yer alan veriler kullanıcı bildirimlerine
                  dayanır. Platform, herhangi bir kurum, belediye, kişi veya
                  siyasi aktör hakkında suçlayıcı yorum üretmeyi amaçlamaz.
                  Amaç, vatandaş katkısıyla yol sorunlarını daha görünür ve
                  ölçülebilir hale getirmektir.
                </p>
              </div>
            </div>
          </GlassPanel>
        </div>
      </main>
    </AppShell>
  );
}
