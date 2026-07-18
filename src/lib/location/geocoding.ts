export type ReverseGeocodedIssueLocation = {
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  locationLabel: string | null;
};

type NominatimReverseAddress = {
  city?: string;
  town?: string;
  village?: string;
  province?: string;
  state?: string;
  city_district?: string;
  district?: string;
  county?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
};

type NominatimReverseResponse = {
  display_name?: string;
  address?: NominatimReverseAddress;
};

const cache = new Map<string, ReverseGeocodedIssueLocation | null>();
const REQUEST_TIMEOUT_MS = 4_000;

export async function reverseGeocodeIssueLocation(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodedIssueLocation | null> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const parameters = new URLSearchParams({
      accept_language: "tr",
      addressdetails: "1",
      format: "jsonv2",
      lat: String(latitude),
      lon: String(longitude),
      zoom: "18",
    });
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${parameters.toString()}`,
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

    const result = parseReverseResponse(await response.json());
    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    if (
      process.env.NODE_ENV === "development" &&
      !(error instanceof DOMException && error.name === "AbortError")
    ) {
      console.warn("Nominatim reverse geocoding failed", error);
    }
    cache.set(cacheKey, null);
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseReverseResponse(
  value: unknown,
): ReverseGeocodedIssueLocation | null {
  if (!value || typeof value !== "object") return null;
  const response = value as NominatimReverseResponse;
  const address = response.address;
  if (!address) return null;

  const city = firstText(
    address.city,
    address.town,
    address.province,
    address.state,
    address.village,
  );
  const district = firstText(
    address.city_district,
    address.district,
    address.county,
    address.suburb,
  );
  const neighborhood = firstText(
    address.neighbourhood,
    address.quarter,
    address.suburb,
  );
  const locationLabel =
    typeof response.display_name === "string"
      ? response.display_name.trim() || null
      : null;

  if (!city && !district && !neighborhood && !locationLabel) return null;

  return {
    city,
    district,
    locationLabel,
    neighborhood,
  };
}

function firstText(...values: (string | undefined)[]) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return null;
}
