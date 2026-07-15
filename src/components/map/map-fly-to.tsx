"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

export type MapFlyToTarget = {
  latitude: number;
  longitude: number;
};

type FlyToCoordinatorProps = {
  target: MapFlyToTarget | null;
};

export function FlyToCoordinator({ target }: FlyToCoordinatorProps) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;

    map.stop();
    map.flyTo([target.latitude, target.longitude], 14, {
      duration: 1.5,
    });
  }, [map, target]);

  return null;
}
