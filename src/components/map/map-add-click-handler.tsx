"use client";

import { useMapEvents } from "react-leaflet";
import type { SelectedRoadIssueLocation } from "@/lib/road-issues/types";

type MapAddClickHandlerProps = {
  enabled: boolean;
  onSelectLocation: (location: SelectedRoadIssueLocation) => void;
};

export function MapAddClickHandler({
  enabled,
  onSelectLocation,
}: MapAddClickHandlerProps) {
  useMapEvents({
    click(event) {
      if (!enabled) {
        return;
      }

      onSelectLocation({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}
