import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorPolygon } from "../../types/vector/generation";
import { VECTOR_LAND_USE_CLASSES, VECTOR_LAND_USE_KINDS, type VectorLandUseKind } from "../../types/vector/landUse";
import { regionArea, regionBoolean } from "./geometry/regions";
import { pathSurface, simpleContour } from "./geometry/surfaces";
import { allVectorWater } from "./geometry/water";

/** Stored land use of the given kinds. */
export const landUseRegions = (doc: VectorCityDocument, kinds: readonly VectorLandUseKind[]): VectorPolygon[] =>
  (doc.environment?.landUse?.zones ?? []).filter(z => kinds.includes(z.kind)).flatMap(z => z.regions);

const ring = (v: unknown): v is Point[] =>
  Array.isArray(v) &&
  v.length >= 3 &&
  v.length <= 16000 &&
  v.every(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === "number" && Number.isFinite(n))) &&
  simpleContour(v as Point[], true);

/** Stored land use: one zone per kind at most, simple regions in the frame, on dry land, with recorded areas. */
export function validateVectorLandUse(doc: VectorCityDocument): string[] {
  const use = doc.environment?.landUse;
  if (use === undefined) return [];
  try {
    const half = doc.frame.extentMeters / 2 + 1e-6,
      water = allVectorWater(doc),
      ok =
        use.version === 1 &&
        VECTOR_LAND_USE_CLASSES.includes(use.landClass) &&
        Array.isArray(use.zones) &&
        new Set(use.zones.map(z => z.kind)).size === use.zones.length &&
        use.zones.every(
          z =>
            VECTOR_LAND_USE_KINDS.includes(z.kind) &&
            Array.isArray(z.regions) &&
            z.regions.length <= 512 &&
            z.regions.every(
              r =>
                ring(r.outer) &&
                Array.isArray(r.holes) &&
                r.holes.length <= 512 &&
                r.holes.every(ring) &&
                r.outer.every(p => Math.abs(p[0]) <= half && Math.abs(p[1]) <= half)
            ) &&
            Math.abs(z.regions.reduce((n, r) => n + regionArea(r), 0) - z.areaM2) < 1 &&
            !regionBoolean(z.regions, water, "intersection").some(r => regionArea(r) > 1)
        );
    return ok ? [] : ["land-use"];
  } catch {
    return ["land-use"];
  }
}

/**
 * Land use kept clear of the water and roads after an edit moved them (a widened river, a moved road): each zone loses
 * what they now cover; a zone left empty goes. Ground they give up stays unused until the town is generated again.
 */
export function refitVectorLandUse(doc: VectorCityDocument): void {
  const use = doc.environment?.landUse;
  if (!use) return;
  const cover = [
    ...allVectorWater(doc),
    ...Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(pathSurface)
  ];
  const zones = use.zones.flatMap(z => {
    const regions = regionBoolean(z.regions, cover, "difference").filter(
      r => regionArea(r) >= 1 && ring(r.outer) && r.holes.every(ring)
    );
    return regions.length ? [{ ...z, regions, areaM2: regions.reduce((n, r) => n + regionArea(r), 0) }] : [];
  });
  if (zones.length) doc.environment!.landUse = { ...use, zones };
  else delete doc.environment!.landUse;
}
