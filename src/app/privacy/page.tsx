import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { GlassPanel } from "@/components/map/glass-panel";

export const metadata: Metadata = {
  title: "Gizlilik Politikası ve Kişisel Verilerin Korunması | YolDurumu",
  description:
    "YolDurumu gizlilik politikası ve kişisel verilerin korunmasına ilişkin bilgilendirme metni.",
};

export default function PrivacyPage() {
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
                Gizlilik Politikası ve Kişisel Verilerin Korunması
              </h1>
            </header>

            <div className="mt-7 space-y-8 md:mt-9 md:space-y-10">
              <section>
                <h2 className="text-lg font-semibold text-ink">
                  1. Veri Sorumlusu
                </h2>
                <p className="mt-3">
                  [WEBSITE_NAME] (&quot;Platform&quot;) olarak, kişisel
                  verilerinizin güvenliği ve gizliliği en büyük önceliğimizdir.
                  Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu
                  (&quot;KVKK&quot;) kapsamında veri sorumlusu sıfatıyla
                  aydınlatma yükümlülüğümüzü yerine getirmek amacıyla
                  hazırlanmıştır.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-ink">
                  2. Toplanan Kişisel Veriler ve İşlenme Amaçları
                </h2>
                <p className="mt-3">
                  Platformu kullanımınız sırasında minimum düzeyde veri toplama
                  (data minimization) prensibiyle hareket ediyoruz:
                </p>
                <ul className="mt-4 list-disc space-y-3 pl-6 marker:text-road-blue">
                  <li>
                    <strong className="font-semibold text-ink">
                      Kimlik ve İletişim Verileri:
                    </strong>{" "}
                    Platforma güvenli giriş yapabilmeniz (Magic Link) ve sistem
                    bilgilendirmeleri için yalnızca e-posta adresiniz işlenir.
                  </li>
                  <li>
                    <strong className="font-semibold text-ink">
                      Konum Verileri:
                    </strong>{" "}
                    Yol sorunlarını bildirirken veya doğrulerken, bildiriminizin
                    güvenilirliğini teyit etmek amacıyla (örn. 500 metre
                    yakınlık kuralı) anlık cihaz konumunuz işlenir. Bu veri arka
                    planda sürekli takip edilmez, yalnızca aksiyon anında alınır.
                  </li>
                  <li>
                    <strong className="font-semibold text-ink">
                      İşlem Güvenliği ve İtibar Verileri:
                    </strong>{" "}
                    Platformdaki etkileşimleriniz (bildirimler, doğrulamalar,
                    etki puanları), manipülasyonu önlemek, itibar algoritmamızı
                    çalıştırmak ve sistem güvenliğini sağlamak amacıyla
                    işlenmektedir.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-ink">
                  3. Kişisel Verilerin Aktarımı
                </h2>
                <p className="mt-3">
                  E-posta adresiniz ve cihaz verileriniz kesinlikle üçüncü taraf
                  reklam şirketlerine veya yetkisiz kurumlara satılmaz. Ancak,
                  platformun temel amacı gereği oluşturduğunuz &quot;yol hasar
                  bildirimleri&quot; (koordinat, kategori, açık kalma süresi)
                  tamamen anonimleştirilerek kamuya açık harita üzerinde
                  yayınlanır.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-ink">
                  4. Veri Güvenliği
                </h2>
                <p className="mt-3">
                  Kişisel verileriniz, endüstri standardı şifreleme yöntemleri
                  ve güvenli veritabanı altyapıları ile korunmaktadır.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-ink">
                  5. İlgili Kişi Olarak Haklarınız
                </h2>
                <p className="mt-3">
                  KVKK’nın 11. maddesi uyarınca; verilerinizin işlenip
                  işlenmediğini öğrenme, amacına uygun kullanılıp
                  kullanılmadığını bilme, eksik/yanlış verilerin düzeltilmesini
                  ve verilerinizin silinmesini talep etme hakkına sahipsiniz. Tüm
                  talepleriniz için [EMAIL_ADDRESS] adresi üzerinden bizimle
                  iletişime geçebilirsiniz.
                </p>
              </section>
            </div>
          </article>
        </GlassPanel>
      </main>
    </AppShell>
  );
}
