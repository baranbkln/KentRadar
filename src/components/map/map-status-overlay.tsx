import { GlassPanel } from "@/components/map/glass-panel";

type MapStatusOverlayProps = {
  title: string;
  body: string;
};

export function MapStatusOverlay({ title, body }: MapStatusOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-28 z-[650] flex justify-center md:top-32">
      <GlassPanel className="pointer-events-auto max-w-md px-5 py-4 text-center">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-ink-muted">{body}</p>
      </GlassPanel>
    </div>
  );
}
