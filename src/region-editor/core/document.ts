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
  if (candidate.format !== REGION_DOCUMENT_FORMAT) {
    return { ok: false, error: `Invalid format: ${candidate.format}, expected ${REGION_DOCUMENT_FORMAT}` };
  }
  if (candidate.version !== REGION_DOCUMENT_VERSION) {
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

  return { ok: true, document: candidate as RegionDocument };
}

export function cloneRegionDocument(doc: RegionDocument): RegionDocument {
  return JSON.parse(JSON.stringify(doc)) as RegionDocument;
}
