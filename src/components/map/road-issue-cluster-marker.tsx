"use client";

import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";
import type { RoadIssueMapCluster } from "@/lib/road-issues/types";

type RoadIssueClusterMarkerProps = {
  cluster: RoadIssueMapCluster;
  onSelect: (cluster: RoadIssueMapCluster) => void;
};

export function RoadIssueClusterMarker({
  cluster,
  onSelect,
}: RoadIssueClusterMarkerProps) {
  const size = getClusterMarkerSize(cluster.issueCount);
  const icon = L.divIcon({
    className: "",
    html: `<div class="road-issue-cluster-marker" style="height:${size}px;width:${size}px"><span>${formatClusterCount(cluster.issueCount)}</span></div>`,
    iconAnchor: [size / 2, size / 2],
    iconSize: [size, size],
  });

  return (
    <Marker
      eventHandlers={{
        click: () => onSelect(cluster),
        keypress: () => onSelect(cluster),
      }}
      icon={icon}
      position={[cluster.latitude, cluster.longitude]}
      title={`${cluster.issueCount} yol sorunu bulunan küme`}
    >
      <Tooltip direction="top" offset={[0, -size / 2]}>
        {cluster.issueCount} yol sorunu
      </Tooltip>
    </Marker>
  );
}

function getClusterMarkerSize(issueCount: number) {
  if (issueCount >= 100) {
    return 58;
  }

  if (issueCount >= 20) {
    return 52;
  }

  return 46;
}

function formatClusterCount(issueCount: number) {
  return issueCount > 999 ? "999+" : issueCount.toLocaleString("tr-TR");
}
