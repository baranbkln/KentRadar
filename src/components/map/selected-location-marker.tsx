"use client";

import L from "leaflet";
import { Marker } from "react-leaflet";
import type { SelectedRoadIssueLocation } from "@/lib/road-issues/types";

type SelectedLocationMarkerProps = {
  location: SelectedRoadIssueLocation;
};

export function SelectedLocationMarker({ location }: SelectedLocationMarkerProps) {
  const icon = L.divIcon({
    className: "",
    html: '<div class="selected-issue-location-marker"><span></span></div>',
    iconAnchor: [18, 18],
    iconSize: [36, 36],
  });

  return (
    <Marker
      icon={icon}
      position={[location.latitude, location.longitude]}
      title="Seçilen sorun konumu"
    />
  );
}
