import type { Metadata } from "next";
import { AboutPage } from "@/components/about/about-page";

export const metadata: Metadata = {
  title: "Projenin Amacı",
  description:
    "KentRadar'ın nötr, veri odaklı ve harita tabanlı yol sorunu gözlem platformu olarak amacını öğrenin.",
};

export default function AboutRoute() {
  return <AboutPage />;
}
