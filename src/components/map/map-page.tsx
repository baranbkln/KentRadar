"use client";

import dynamic from "next/dynamic";

const RoadIssueMap = dynamic(
  () =>
    import("@/components/map/road-issue-map").then(
      (module) => module.RoadIssueMap,
    ),
  {
    loading: () => (
      <main className="flex min-h-dvh items-center justify-center bg-surface text-ink">
        <div className="glass-panel px-5 py-4 text-sm text-ink-muted">
          Harita yükleniyor...
        </div>
      </main>
    ),
    ssr: false,
  },
);

export function MapPage() {
  return <RoadIssueMap />;
}
