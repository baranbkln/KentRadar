import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type Position = number[];

type PolygonGeometry = {
  type: "Polygon";
  coordinates: Position[][];
};

type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: Position[][][];
};

type BoundaryGeometry = PolygonGeometry | MultiPolygonGeometry;

type GeoJsonFeature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: BoundaryGeometry | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

type BoundaryLevel = "city" | "district";

const projectRoot = process.cwd();
const citiesFile = path.join(projectRoot, "data", "cities.geojson");
const districtsFile = path.join(projectRoot, "data", "districts.geojson");

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} ortam değişkeni tanımlı değil.`);
  }
  return value;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function cityLookupKey(value: string): string {
  return normalizeName(value).toLocaleLowerCase("tr-TR");
}

function readRequiredProperty(
  feature: GeoJsonFeature,
  propertyName: string,
  featureIndex: number,
  fileLabel: string,
): string {
  const value = feature.properties?.[propertyName];
  if (typeof value !== "string" || normalizeName(value).length === 0) {
    throw new Error(
      `${fileLabel} dosyasındaki ${featureIndex + 1}. kayıtta properties.${propertyName} eksik.`,
    );
  }
  return normalizeName(value);
}

function assertBoundaryGeometry(
  geometry: GeoJsonFeature["geometry"],
  featureIndex: number,
  fileLabel: string,
): asserts geometry is BoundaryGeometry {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error(
      `${fileLabel} dosyasındaki ${featureIndex + 1}. kayıt Polygon veya MultiPolygon değil.`,
    );
  }
}

async function readFeatureCollection(
  filePath: string,
  fileLabel: string,
): Promise<GeoJsonFeatureCollection> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${fileLabel} okunamadı: ${filePath}`, { cause: error });
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("type" in parsed) ||
    parsed.type !== "FeatureCollection" ||
    !("features" in parsed) ||
    !Array.isArray(parsed.features)
  ) {
    throw new Error(`${fileLabel} geçerli bir GeoJSON FeatureCollection değil.`);
  }

  return parsed as GeoJsonFeatureCollection;
}

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ||
    requireEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const [cities, districts] = await Promise.all([
    readFeatureCollection(citiesFile, "cities.geojson"),
    readFeatureCollection(districtsFile, "districts.geojson"),
  ]);

  const cityIds = new Map<string, string>();
  console.info(`${cities.features.length} şehir sınırı işleniyor...`);

  for (const [index, feature] of cities.features.entries()) {
    const name = readRequiredProperty(feature, "name", index, "cities.geojson");
    assertBoundaryGeometry(feature.geometry, index, "cities.geojson");

    const { data, error } = await supabase.rpc("insert_admin_boundary", {
      p_name: name,
      p_level: "city" satisfies BoundaryLevel,
      p_parent_id: null,
      p_geojson_geom: JSON.stringify(feature.geometry),
    });

    if (error || typeof data !== "string") {
      throw new Error(`Şehir sınırı kaydedilemedi: ${name}`, {
        cause: error ?? new Error("RPC geçerli bir sınır kimliği döndürmedi."),
      });
    }

    cityIds.set(cityLookupKey(name), data);
    console.info(`[şehir ${index + 1}/${cities.features.length}] ${name}`);
  }

  console.info(`${districts.features.length} ilçe sınırı işleniyor...`);

  for (const [index, feature] of districts.features.entries()) {
    const name = readRequiredProperty(feature, "name", index, "districts.geojson");
    const cityName = readRequiredProperty(
      feature,
      "city_name",
      index,
      "districts.geojson",
    );
    assertBoundaryGeometry(feature.geometry, index, "districts.geojson");

    const parentId = cityIds.get(cityLookupKey(cityName));
    if (!parentId) {
      throw new Error(
        `${name} ilçesinin üst şehri cities.geojson içinde bulunamadı: ${cityName}`,
      );
    }

    const { data, error } = await supabase.rpc("insert_admin_boundary", {
      p_name: name,
      p_level: "district" satisfies BoundaryLevel,
      p_parent_id: parentId,
      p_geojson_geom: JSON.stringify(feature.geometry),
    });

    if (error || typeof data !== "string") {
      throw new Error(`İlçe sınırı kaydedilemedi: ${cityName} / ${name}`, {
        cause: error ?? new Error("RPC geçerli bir sınır kimliği döndürmedi."),
      });
    }

    console.info(
      `[ilçe ${index + 1}/${districts.features.length}] ${cityName} / ${name}`,
    );
  }

  console.info("Mevcut yol sorunlarının sınır bilgileri güncelleniyor...");
  const { data: updatedIssueCount, error: backfillError } = await supabase.rpc(
    "backfill_road_issues_boundaries",
  );

  if (backfillError) {
    throw new Error("Yol sorunu sınır backfill işlemi tamamlanamadı.", {
      cause: backfillError,
    });
  }

  console.info(
    `Tamamlandı. ${cities.features.length} şehir, ${districts.features.length} ilçe işlendi; ${Number(updatedIssueCount ?? 0)} yol sorunu güncellendi.`,
  );
}

main().catch((error: unknown) => {
  console.error("Sınır verisi aktarımı başarısız oldu.");
  console.error(error);
  process.exitCode = 1;
});
