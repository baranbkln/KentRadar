import type { Metadata, Viewport } from "next";
import { PwaRegistrar } from "@/components/pwa-registrar";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "YolDurumu - Altyapı Sorunları Haritası",
    template: "%s | YolDurumu",
  },
  description:
    "Şehrinizdeki çukur, bozuk yol ve altyapı sorunlarını harita üzerinde bildirin, topluluk doğrulamasıyla çözüme kavuşturun.",
  applicationName: "YolDurumu",
  appleWebApp: {
    capable: true,
    title: "YolDurumu",
    statusBarStyle: "black-translucent",
  },
  keywords: [
    "yol sorunları",
    "çukur bildirimi",
    "bozuk yol",
    "altyapı haritası",
    "topluluk doğrulaması",
  ],
  authors: [{ name: "YolDurumu" }],
  creator: "YolDurumu",
  publisher: "YolDurumu",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: "/",
    siteName: "YolDurumu",
    title: "YolDurumu - Altyapı Sorunları Haritası",
    description:
      "Şehrinizdeki çukur, bozuk yol ve altyapı sorunlarını harita üzerinde bildirin, topluluk doğrulamasıyla çözüme kavuşturun.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "YolDurumu altyapı sorunları haritası",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "YolDurumu - Altyapı Sorunları Haritası",
    description:
      "Şehrinizdeki çukur, bozuk yol ve altyapı sorunlarını bildirin ve toplulukla doğrulayın.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>
        {children}
        <PwaRegistrar />
      </body>
    </html>
  );
}
