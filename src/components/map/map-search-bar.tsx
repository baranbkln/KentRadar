"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin, Search, X } from "lucide-react";
import type { MapFlyToTarget } from "@/components/map/map-fly-to";
import { cn } from "@/lib/utils";

export type NominatimSearchResult = {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  class: string;
  type: string;
  place_rank: number;
  importance: number;
  display_name: string;
  boundingbox: [string, string, string, string];
};

type MapSearchBarProps = {
  onSelect: (target: MapFlyToTarget) => void;
  className?: string;
};

const SEARCH_DEBOUNCE_MS = 500;
const MINIMUM_QUERY_LENGTH = 3;
const RESULT_LIST_ID = "map-address-search-results";

export function MapSearchBar({ onSelect, className }: MapSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef(new Map<string, NominatimSearchResult[]>());

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < MINIMUM_QUERY_LENGTH) {
      setResults([]);
      setIsLoading(false);
      setIsOpen(false);
      setHasSearched(false);
      setError(null);
      setActiveIndex(-1);
      return;
    }

    const cacheKey = normalizedQuery.toLocaleLowerCase("tr-TR");
    const cachedResults = cacheRef.current.get(cacheKey);
    if (cachedResults) {
      setResults(cachedResults);
      setIsOpen(true);
      setHasSearched(true);
      setError(null);
      setActiveIndex(cachedResults.length > 0 ? 0 : -1);
      return;
    }

    let controller: AbortController | null = null;
    const timeout = window.setTimeout(async () => {
      controller = new AbortController();
      setIsLoading(true);
      setHasSearched(false);
      setError(null);

      try {
        const parameters = new URLSearchParams({
          format: "json",
          q: normalizedQuery,
          countrycodes: "tr",
          limit: "5",
        });
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${parameters.toString()}`,
          {
            headers: {
              Accept: "application/json",
              "Accept-Language": "tr",
            },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Nominatim HTTP ${response.status}`);
        }

        const parsedResults = parseNominatimResults(await response.json());
        cacheRef.current.set(cacheKey, parsedResults);
        setResults(parsedResults);
        setActiveIndex(parsedResults.length > 0 ? 0 : -1);
        setHasSearched(true);
        setIsOpen(true);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }

        if (process.env.NODE_ENV === "development") {
          console.warn("Nominatim address search failed", requestError);
        }
        setResults([]);
        setError("Adres aranırken bir hata oluştu.");
        setHasSearched(true);
        setIsOpen(true);
        setActiveIndex(-1);
      } finally {
        setIsLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller?.abort();
    };
  }, [query]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const selectResult = (result: NominatimSearchResult) => {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    onSelect({ latitude, longitude });
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setHasSearched(false);
    setActiveIndex(-1);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "pointer-events-auto absolute left-1/2 top-[148px] z-[660] w-[calc(100%-24px)] max-w-md -translate-x-1/2 md:top-[108px]",
        className,
      )}
    >
      <div className="glass-panel flex min-h-11 items-center gap-2 rounded-full border border-white/45 bg-white/72 px-3 shadow-lg backdrop-blur-xl">
        <Search className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-activedescendant={
            activeIndex >= 0 ? `map-search-result-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={RESULT_LIST_ID}
          aria-expanded={isOpen}
          aria-label="Adres veya konum ara"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (results.length > 0 || hasSearched || error) setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
              return;
            }

            if (event.key === "ArrowDown" && results.length > 0) {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((current) => (current + 1) % results.length);
              return;
            }

            if (event.key === "ArrowUp" && results.length > 0) {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((current) =>
                current <= 0 ? results.length - 1 : current - 1,
              );
              return;
            }

            if (event.key === "Enter" && isOpen && results.length > 0) {
              event.preventDefault();
              selectResult(results[Math.max(activeIndex, 0)]);
            }
          }}
          placeholder="Adres ara: Bilkent, Ankara"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-ink-subtle"
        />
        {isLoading ? (
          <LoaderCircle
            className="size-4 shrink-0 animate-spin text-road-blue"
            aria-label="Adres aranıyor"
          />
        ) : null}
        {query ? (
          <button
            type="button"
            aria-label="Aramayı temizle"
            onClick={() => setQuery("")}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted transition hover:bg-white/80 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-road-blue"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div
          id={RESULT_LIST_ID}
          role="listbox"
          aria-label="Adres arama sonuçları"
          className="glass-panel mt-2 max-h-72 overflow-y-auto rounded-2xl border border-white/45 bg-white/90 p-2 shadow-xl backdrop-blur-xl"
        >
          {error ? (
            <p className="px-3 py-3 text-sm font-medium text-red-700">{error}</p>
          ) : null}

          {!error && hasSearched && !isLoading && results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-muted">
              Bu aramayla eşleşen konum bulunamadı.
            </p>
          ) : null}

          {!error
            ? results.map((result, index) => (
                <button
                  key={`${result.osm_type}-${result.osm_id}-${result.place_id}`}
                  id={`map-search-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onClick={() => selectResult(result)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex min-h-11 w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm leading-5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-road-blue",
                    activeIndex === index
                      ? "bg-blue-50 text-ink"
                      : "text-ink-muted hover:bg-white hover:text-ink",
                  )}
                >
                  <MapPin
                    className="mt-0.5 size-4 shrink-0 text-road-blue"
                    aria-hidden="true"
                  />
                  <span>{result.display_name}</span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

function parseNominatimResults(value: unknown): NominatimSearchResult[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const boundingbox = record.boundingbox;

    if (
      typeof record.place_id !== "number" ||
      typeof record.osm_id !== "number" ||
      typeof record.lat !== "string" ||
      typeof record.lon !== "string" ||
      typeof record.display_name !== "string" ||
      typeof record.licence !== "string" ||
      typeof record.osm_type !== "string" ||
      typeof record.class !== "string" ||
      typeof record.type !== "string" ||
      typeof record.place_rank !== "number" ||
      typeof record.importance !== "number" ||
      !Array.isArray(boundingbox) ||
      boundingbox.length !== 4 ||
      !boundingbox.every((coordinate) => typeof coordinate === "string")
    ) {
      return [];
    }

    return [
      {
        place_id: record.place_id,
        licence: record.licence,
        osm_type: record.osm_type,
        osm_id: record.osm_id,
        lat: record.lat,
        lon: record.lon,
        class: record.class,
        type: record.type,
        place_rank: record.place_rank,
        importance: record.importance,
        display_name: record.display_name,
        boundingbox: boundingbox as [string, string, string, string],
      },
    ];
  });
}
