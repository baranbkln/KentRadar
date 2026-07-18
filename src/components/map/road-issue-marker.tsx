"use client";

import { useMemo } from "react";
import { Marker } from "react-leaflet";
import { createRankIcon } from "@/components/map/custom-marker";
import { calculateIssueIntensity } from "@/lib/issues/issue-intensity";
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
  const reporterScore = issue.reporter_score ?? 0;
  const icon = useMemo(
    () => createRankIcon(reporterScore, { isSelected }),
    [isSelected, reporterScore],
  );

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
