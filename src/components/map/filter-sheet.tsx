"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  categoryOptions,
  statusOptions,
  type RoadIssueCategory,
  type RoadIssueStatus,
} from "@/lib/domain/road-issue-options";
import type { RoadIssueFilters } from "@/lib/road-issues/types";
import { cn } from "@/lib/utils";

type FilterSheetProps = {
  filters: RoadIssueFilters;
  onApply: (filters: RoadIssueFilters) => void;
  onClose: () => void;
};

const emptyFilters: RoadIssueFilters = {
  categories: [],
  status: "all",
};

export function FilterSheet({ filters, onApply, onClose }: FilterSheetProps) {
  const [draftFilters, setDraftFilters] = useState<RoadIssueFilters>(filters);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[740] md:fixed md:inset-auto md:bottom-5 md:right-5 md:top-28 md:w-[360px]">
      <button
        aria-label="Kapat"
        className="absolute inset-0 h-full w-full cursor-default bg-transparent md:hidden"
        onClick={onClose}
        type="button"
      />
      <div className="absolute inset-x-3 bottom-3 rounded-[28px] md:inset-0 md:w-full">
        <div className="glass-panel pointer-events-auto p-3 md:p-3.5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Filtreler</h2>
            <button
              aria-label="Kapat"
              className="flex size-11 items-center justify-center rounded-full bg-white/72 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              onClick={onClose}
              type="button"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="space-y-2.5">
            <CategoryFilterGroup
              label="Kategori"
              selectedCategories={draftFilters.categories}
              onChange={(category) =>
                setDraftFilters({
                  ...draftFilters,
                  categories: toggleCategory(draftFilters.categories, category),
                })
              }
              onSelectAll={() =>
                setDraftFilters({
                  ...draftFilters,
                  categories: [],
                })
              }
            />

            <FilterOptionGroup
              label="Durum"
              options={[{ label: "Tüm durumlar", value: "all" }, ...statusOptions]}
              value={draftFilters.status}
              onChange={(status) =>
                setDraftFilters({
                  ...draftFilters,
                  status: status as RoadIssueStatus | "all",
                })
              }
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="min-h-11 rounded-full border border-slate-200 bg-white/72 px-4 text-sm font-semibold text-ink-muted transition hover:bg-white hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              onClick={() => setDraftFilters(emptyFilters)}
              type="button"
            >
              Temizle
            </button>
            <button
              className="min-h-11 rounded-full bg-road-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue"
              onClick={() => onApply(draftFilters)}
              type="button"
            >
              Uygula
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function toggleCategory(
  categories: RoadIssueCategory[],
  category: RoadIssueCategory,
) {
  if (categories.includes(category)) {
    return categories.filter((value) => value !== category);
  }

  return [...categories, category];
}

type FilterOptionGroupProps = {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
};

function FilterOptionGroup({
  label,
  options,
  value,
  onChange,
}: FilterOptionGroupProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 px-1 text-[11px] font-semibold uppercase text-ink-subtle">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((option) => {
          const isActive = option.value === value;

          return (
            <button
              aria-pressed={isActive}
              className={cn(
                "flex min-h-10 items-center justify-between gap-1.5 rounded-full border px-2.5 py-1 text-left text-[11px] font-semibold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
                isActive
                  ? "border-road-blue bg-white text-ink shadow-sm"
                  : "border-slate-200 bg-white/62 text-ink-muted hover:bg-white",
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <span className="min-w-0 break-words">{option.label}</span>
              {isActive ? (
                <Check aria-hidden="true" className="size-3.5 shrink-0 text-road-blue" />
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

type CategoryFilterGroupProps = {
  label: string;
  selectedCategories: RoadIssueCategory[];
  onChange: (category: RoadIssueCategory) => void;
  onSelectAll: () => void;
};

function CategoryFilterGroup({
  label,
  selectedCategories,
  onChange,
  onSelectAll,
}: CategoryFilterGroupProps) {
  const allCategoriesSelected = selectedCategories.length === 0;

  return (
    <fieldset>
      <legend className="mb-1.5 px-1 text-[11px] font-semibold uppercase text-ink-subtle">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-1.5">
        <FilterChoiceButton
          isActive={allCategoriesSelected}
          label="Tüm kategoriler"
          onClick={onSelectAll}
        />
        {categoryOptions.map((option) => (
          <FilterChoiceButton
            isActive={selectedCategories.includes(option.value)}
            key={option.value}
            label={option.label}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    </fieldset>
  );
}

type FilterChoiceButtonProps = {
  isActive: boolean;
  label: string;
  onClick: () => void;
};

function FilterChoiceButton({
  isActive,
  label,
  onClick,
}: FilterChoiceButtonProps) {
  return (
    <button
      aria-pressed={isActive}
      className={cn(
        "flex min-h-10 items-center justify-between gap-1.5 rounded-full border px-2.5 py-1 text-left text-[11px] font-semibold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue",
        isActive
          ? "border-road-blue bg-white text-ink shadow-sm"
          : "border-slate-200 bg-white/62 text-ink-muted hover:bg-white",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0 break-words">{label}</span>
      {isActive ? (
        <Check aria-hidden="true" className="size-3.5 shrink-0 text-road-blue" />
      ) : null}
    </button>
  );
}
