import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { GlassPanel } from "@/components/map/glass-panel";

export const metadata: Metadata = {
  title: "Kullanım Koşulları | YolDurumu",
  description: "YolDurumu platformunun kullanım koşulları.",
};

export default function TermsPage() {
  return (
    <AppShell>
      <main className="min-h-dvh px-3 py-5 text-ink md:px-6 md:py-8">
        <GlassPanel className="mx-auto max-w-4xl px-5 py-7 md:px-10 md:py-10">
          <article className="text-[15px] leading-7 text-ink-muted md:text-base md:leading-8">
            <header className="border-b border-slate-200/80 pb-6 md:pb-8">
              <p className="text-sm font-semibold text-road-blue">
                YolDurumu
              </p>
              <h1 className="mt-2 text-2xl font-semibold leading-tight text-ink md:text-3xl">
                Kullanım Koşulları
              </h1>
            </header>

            <div className="mt-7 space-y-8 md:mt-9 md:space-y-10">
              <section>
                <h2 className="text-lg font-semibold text-ink">
                  1. Platformun Amacı ve Hukuki Statüsü
                </h2>
                <p className="mt-3">
                  [WEBSITE_NAME], vatandaşların karşılaştıkları altyapı
                  sorunlarını harita üzerinde tarafsızca işaretleyebildikleri,
                  kitle kaynaklı (crowdsourced) bir veri gözlem ağıdır. Platform,
                  hiçbir resmi kurum, kuruluş veya belediye ile bağlantılı
                  değildir. Tamamen bağımsız bir sivil veri inisiyatifidir.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-ink">
                  2. Kullanıcı Yükümlülükleri ve Sınırlandırmalar
                </h2>
                <p className="mt-3">
                  Platformun güvenilirliğini korumak adına aşağıdaki kurallara
                  uyulması zorunludur:
                </p>
                <ul className="mt-4 list-disc space-y-3 pl-6 marker:text-road-blue">
                  <li>
                    <strong className="font-semibold text-ink">
                      Tarafsızlık:
                    </strong>{" "}
                    Platform, kurumları suçlama, siyasi tartışma yaratma veya
                    şikayet forumu olarak kullanılamaz.
                  </li>
                  <li>
                    <strong className="font-semibold text-ink">
                      Kişisel İtham ve Hakaret:
                    </strong>{" "}
                    Bildirimlerde kişi, kurum, plaka veya marka hedef alınamaz;
                    hakaret ve nefret söylemi kesinlikle yasaktır.
                  </li>
                  <li>
                    <strong className="font-semibold text-ink">
                      Veri Manipülasyonu:
                    </strong>{" "}
                    Sahte konum araçları kullanarak sistemi yanıltmak, mükerrer
                    spam bildirimler yapmak veya itibar sistemini kötüye
                    kullanmak yasaktır. Bu tür eylemler hesabın kalıcı olarak
                    askıya alınmasına neden olur.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-ink">
                  3. İçerik Sorumluluğu ve Doğruluk
                </h2>
                <p className="mt-3">
                  Platformdaki veriler kullanıcı bildirimlerine ve topluluk
                  doğrulamasına dayanır. [WEBSITE_NAME], haritadaki sorunların
                  varlığını, anlık durumunu veya hasar potansiyelini garanti
                  etmez. Kullanıcılar, harita verilerine dayanarak aldıkları
                  kararlardan ve olası maddi/manevi zararlardan kendileri
                  sorumludur.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-ink">
                  4. Fikri Mülkiyet
                </h2>
                <p className="mt-3">
                  Platforma eklediğiniz yol sorunları ve koordinat verilerinin
                  (anonimleştirilmiş formatta) [WEBSITE_NAME] tarafından
                  yayınlanması, analiz edilmesi ve paylaşılması için platforma
                  bedelsiz ve kalıcı bir kullanım hakkı vermiş sayılırsınız.
                </p>
              </section>
            </div>
          </article>
        </GlassPanel>
      </main>
    </AppShell>
  );
}
