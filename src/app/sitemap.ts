import type { MetadataRoute } from "next";

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://[WEBSITE_NAME]"
).replace(/\/$/, "");

const routes = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/issues", changeFrequency: "hourly", priority: 0.9 },
  { path: "/fixed", changeFrequency: "daily", priority: 0.8 },
  { path: "/leaderboard", changeFrequency: "daily", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.4 },
] as const satisfies ReadonlyArray<{
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
}>;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map(({ path, changeFrequency, priority }) => ({
    url: `${siteUrl}${path}`,
    changeFrequency,
    priority,
  }));
}
