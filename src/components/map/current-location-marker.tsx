"use client";

import L from "leaflet";
import { Circle, Marker } from "react-leaflet";

type CurrentLocationMarkerProps = {
  accuracyMeters: number | null;
  latitude: number;
  longitude: number;
};

export function CurrentLocationMarker({
  accuracyMeters,
  latitude,
  longitude,
}: CurrentLocationMarkerProps) {
  const icon = L.divIcon({
    className: "",
    html: '<div class="current-location-marker"><span></span></div>',
    iconAnchor: [13, 13],
    iconSize: [26, 26],
  });

  return (
    <>
      {accuracyMeters ? (
        <Circle
          center={[latitude, longitude]}
          pathOptions={{
            color: "#2563EB",
            fillColor: "#2563EB",
            fillOpacity: 0.1,
            opacity: 0.22,
            weight: 1,
          }}
          radius={Math.min(accuracyMeters, 250)}
        />
      ) : null}
      <Marker
        icon={icon}
        interactive={false}
        position={[latitude, longitude]}
        title="Mevcut konum"
      />
    </>
  );
}
