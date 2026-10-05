import { generateFarmland } from "./gen/farmland";
import type { RegionSiteDescriptor } from "./types";
import {
  DEFAULT_REGION_SETTINGS,
  REGION_DOCUMENT_FORMAT,
  REGION_DOCUMENT_VERSION,
  type RegionDecoration,
  type RegionDocument,
  type RegionGenerationSettings
} from "./types";

export function createEmptyRegionDocument(settings: Partial<RegionGenerationSettings> = {}): RegionDocument {
  const merged: RegionGenerationSettings = { ...DEFAULT_REGION_SETTINGS, ...settings };
  const widthMeters = merged.widthMeters;
  const heightMeters = merged.heightMeters;
  const metersPerUnit = merged.metersPerUnit;

  const widthUnits = widthMeters / metersPerUnit;
  const heightUnits = heightMeters / metersPerUnit;

  const defaultDecoration: RegionDecoration = {
    theme: merged.theme,
    showCompassRose: true,
    compassPosition: [widthUnits - 80, 80],
    showScaleBar: true,
    scaleBarPosition: [80, heightUnits - 40],
    showBorder: true,
    borderStyle: "ornate"
  };

  return {
    format: REGION_DOCUMENT_FORMAT,
    version: REGION_DOCUMENT_VERSION,
    id: `region-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    title: merged.title,
    seed: merged.seed,
    bounds: {
      widthMeters,
      heightMeters,
      metersPerUnit
    },
    terrain: {
      coastlinePolygons: [],
      lakePolygons: []
    },
    biomes: [],
    symbols: [],
    rivers: [],
    bridges: [],
    routes: [],
    settlements: [],
    landmarks: [],
    labels: [],
    decoration: defaultDecoration
  };
}

export function validateRegionDocument(
  doc: unknown
): { ok: true; document: RegionDocument } | { ok: false; error: string } {
  if (!doc || typeof doc !== "object") {
    return { ok: false, error: "Document must be an object" };
  }
  const candidate = doc as Partial<RegionDocument>;
  const storedVersion = (doc as { version?: number }).version;
  if (candidate.format !== REGION_DOCUMENT_FORMAT) {
    return { ok: false, error: `Invalid format: ${candidate.format}, expected ${REGION_DOCUMENT_FORMAT}` };
  }
  if (candidate.version !== REGION_DOCUMENT_VERSION && storedVersion !== 1) {
    return { ok: false, error: `Unsupported version: ${candidate.version}, expected ${REGION_DOCUMENT_VERSION}` };
  }
  if (
    !candidate.bounds ||
    typeof candidate.bounds.widthMeters !== "number" ||
    typeof candidate.bounds.heightMeters !== "number"
  ) {
    return { ok: false, error: "Invalid bounds in RegionDocument" };
  }
  if (!Array.isArray(candidate.symbols) || !Array.isArray(candidate.rivers) || !Array.isArray(candidate.bridges)) {
    return { ok: false, error: "Missing required arrays (symbols, rivers, bridges)" };
  }

  // Preserve legacy parcel geometry rather than dropping it during migration.
  const legacy = candidate as Partial<RegionDocument> & {
    farmland?: Array<{ id?: string; settlementId: string; areaHectares: number; polygon?: [number, number][] }>;
  };
  if (!candidate.landUse && legacy.farmland?.some(p => p.polygon?.length)) {
    candidate.landUse = {
      modelVersion: 1,
      revision: 1,
      year: 0,
      seed: candidate.seed ?? "legacy",
      provenance: "legacy",
      unplacedAreaHa: 0,
      diagnostics: ["legacy-area-provenance"],
      patches: legacy.farmland
        .filter(p => p.polygon?.length)
        .map((p, i) => ({
          id: p.id ?? `legacy-field:${i}`,
          sourceCellId: -1,
          kind: "cultivation",
          areaHa: p.areaHectares,
          anchor: p.polygon![0],
          polygon: p.polygon!,
          supplierIds: [p.settlementId],
          stage: "maintained",
          convertedForestAreaHa: 0,
          userEdited: true
        }))
    };
  }
  for (const settlement of candidate.settlements ?? []) {
    settlement.farmlandAreaHectares ??= (legacy.farmland ?? [])
      .filter(field => field.settlementId === settlement.id)
      .reduce((sum, field) => sum + field.areaHectares, 0);
  }
  delete legacy.farmland;
  if (storedVersion === 1 && !candidate.landUse && candidate.biomes?.length && candidate.settlements) {
    const document = candidate as RegionDocument;
    const site = {
      version: 1,
      sourceSeed: document.seed,
      metersPerMapUnit: document.bounds.metersPerUnit,
      cells: document.biomes.map((b, i) => ({
        sourceCellId: i,
        point: b.polygon[0] ?? [0, 0],
        polygon: b.polygon,
        elevationMeters: 0,
        biomeId: i,
        biomeName: b.kind,
        isWater: b.isWater || b.kind === "ocean"
      }))
    } as RegionSiteDescriptor;
    generateFarmland(document, site, p => p);
    document.landUse!.diagnostics.push("legacy-rural-population-unknown");
  }
  candidate.version = REGION_DOCUMENT_VERSION;
  return { ok: true, document: candidate as RegionDocument };
}

export function cloneRegionDocument(doc: RegionDocument): RegionDocument {
  return JSON.parse(JSON.stringify(doc)) as RegionDocument;
}
