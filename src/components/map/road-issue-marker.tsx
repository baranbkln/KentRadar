"use client";

import L from "leaflet";
import { Marker } from "react-leaflet";
import {
  calculateIssueIntensity,
  getIssueMarkerStyle,
} from "@/lib/issues/issue-intensity";
import type { PublicRoadIssue } from "@/lib/road-issues/types";

type RoadIssueMarkerProps = {
  issue: PublicRoadIssue;
  isSelected: boolean;
  onSelect: (issue: PublicRoadIssue) => void;
};

const categoryMarkerText: Record<PublicRoadIssue["category"], string> = {
  pothole: "Ç",
  collapsed_road: "ÇY",
  broken_asphalt: "A",
  manhole_cover: "R",
  water_accumulation: "S",
  other: "D",
};

export function RoadIssueMarker({
  issue,
  isSelected,
  onSelect,
}: RoadIssueMarkerProps) {
  const intensity = calculateIssueIntensity(issue);
  const markerStyle = getIssueMarkerStyle(intensity.level);
  const icon = L.divIcon({
    className: "",
    html: `<div class="road-issue-marker" data-intensity="${intensity.level}" style="background:${markerStyle.color}; color:${markerStyle.color}; opacity:${markerStyle.opacity}; box-shadow:${markerStyle.ring}; transform:${isSelected ? "scale(1.14)" : "scale(1)"};"><span style="color:white;">${categoryMarkerText[issue.category]}</span></div>`,
    iconAnchor: [17, 40],
    iconSize: [34, 42],
  });

  return (
    <Marker
      eventHandlers={{
        click: () => onSelect(issue),
        keypress: () => onSelect(issue),
      }}
      icon={icon}
      position={[issue.latitude, issue.longitude]}
      title={`${categoryMarkerText[issue.category]} yol sorunu · ${intensity.label}`}
    />
  );
}
