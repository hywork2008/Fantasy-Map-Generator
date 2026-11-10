import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorPolygon } from "../../types/vector/generation";
import { regionArea, regionBoolean } from "./geometry/regions";
import { simpleContour } from "./geometry/surfaces";
import { allVectorWater } from "./geometry/water";

/** The woodland keeps its ground: nothing else is built on it. */
export const forestReservations = (doc: VectorCityDocument): VectorPolygon[] => doc.environment?.forest?.regions ?? [];

const ring = (v: unknown): v is Point[] =>
  Array.isArray(v) &&
  v.length >= 3 &&
  v.length <= 16000 &&
  v.every(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === "number" && Number.isFinite(n))) &&
  simpleContour(v as Point[], true);

/** Stored woodland: simple regions in the frame, on dry land, with its recorded area. */
export function validateVectorForest(doc: VectorCityDocument): string[] {
  const forest = doc.environment?.forest;
  if (forest === undefined) return [];
  try {
    const half = doc.frame.extentMeters / 2 + 1e-6,
      ok =
        ["legacy", "farmland", "surroundings"].includes(forest.mode) &&
        ["sparse", "standard", "dense"].includes(forest.density) &&
        Array.isArray(forest.regions) &&
        forest.regions.length <= 256 &&
        forest.regions.every(
          r =>
            ring(r.outer) &&
            Array.isArray(r.holes) &&
            r.holes.length <= 256 &&
            r.holes.every(ring) &&
            r.outer.every(p => Math.abs(p[0]) <= half && Math.abs(p[1]) <= half)
        ) &&
        Math.abs(forest.regions.reduce((n, r) => n + regionArea(r), 0) - forest.areaM2) < 1 &&
        !regionBoolean(forest.regions, allVectorWater(doc), "intersection").some(r => regionArea(r) > 1);
    return ok ? [] : ["forest"];
  } catch {
    return ["forest"];
  }
}
