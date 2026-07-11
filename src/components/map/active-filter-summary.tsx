"use client";

import { X } from "lucide-react";
import {
  categoryLabels,
  statusLabels,
} from "@/lib/domain/road-issue-options";
import type { RoadIssueFilters } from "@/lib/road-issues/types";

type ActiveFilterSummaryProps = {
  filters: RoadIssueFilters;
  onChange: (filters: RoadIssueFilters) => void;
};

export function ActiveFilterSummary({
  filters,
  onChange,
}: ActiveFilterSummaryProps) {
  const activeFilters = [
    ...filters.categories.map((category) => ({
      key: `category-${category}`,
      label: categoryLabels[category],
      onRemove: () =>
        onChange({
          ...filters,
          categories: filters.categories.filter((value) => value !== category),
        }),
    })),
    filters.status !== "all"
      ? {
          key: "status",
          label: statusLabels[filters.status],
          onRemove: () => onChange({ ...filters, status: "all" }),
        }
      : null,
  ].filter(Boolean) as {
    key: string;
    label: string;
    onRemove: () => void;
  }[];

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-auto flex flex-wrap gap-2">
      {activeFilters.map((filter) => (
        <button
          aria-label={`${filter.label} filtresini kaldır`}
          className="glass-panel inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
          key={filter.key}
          onClick={filter.onRemove}
          type="button"
        >
          {filter.label}
          <X className="size-4" />
        </button>
      ))}
    </div>
  );
}
