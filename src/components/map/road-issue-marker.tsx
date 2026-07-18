"use client";

import { useMemo } from "react";
import { Marker } from "react-leaflet";
import { createRankIcon } from "@/components/map/custom-marker";
import { calculateIssueIntensity } from "@/lib/issues/issue-intensity";
import type { PublicRoadIssue } from "@/lib/road-issues/types";
import { getUserRank } from "@/utils/ranks";

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

const MOCK_REPORTER_SCORES = [30, 120, 350, 720] as const;

export function RoadIssueMarker({
  issue,
  isSelected,
  onSelect,
}: RoadIssueMarkerProps) {
  const intensity = calculateIssueIntensity(issue);
  const reporterScore =
    issue.reporter_score ?? getMockReporterScore(issue.id);
  const reporterRank = getUserRank(reporterScore);
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
      title={`${categoryMarkerText[issue.category]} yol sorunu · ${intensity.label} · ${reporterRank.title}`}
    />
  );
}

function getMockReporterScore(issueId: string) {
  const hash = Array.from(issueId).reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );

  return MOCK_REPORTER_SCORES[hash % MOCK_REPORTER_SCORES.length];
}
