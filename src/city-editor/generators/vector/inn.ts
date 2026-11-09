import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorPolygon } from "../../types/vector/generation";
import { regionArea, regionBoolean } from "./geometry/regions";
import { simpleContour } from "./geometry/surfaces";
import { allVectorWater } from "./geometry/water";

const ring = (outer: Point[]): VectorPolygon => ({ outer, holes: [] });

/** Ground an inn keeps: its whole footprint, rooms and yard. */
export const innReservations = (doc: VectorCityDocument): VectorPolygon[] =>
  (doc.environment?.inns ?? []).map(inn => ring(inn.footprint));

const point = (v: unknown): v is Point =>
  Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number" && Number.isFinite(n));
const polygon = (v: unknown): v is Point[] =>
  Array.isArray(v) && v.length >= 3 && v.length <= 16 && v.every(point) && simpleContour(v as Point[], true);

/** Stored inns are simple rings on dry land in the site, each yard inside its footprint. */
export function validateVectorInns(doc: VectorCityDocument): string[] {
  const inns = doc.environment?.inns;
  if (inns === undefined) return [];
  try {
    const water = allVectorWater(doc),
      domain = doc.site?.domain ?? [];
    const ok =
      Array.isArray(inns) &&
      inns.length <= 16 &&
      new Set(inns.map(i => i.id)).size === inns.length &&
      inns.every(
        inn =>
          ["inn", "caravanserai"].includes(inn.kind) &&
          polygon(inn.footprint) &&
          polygon(inn.court) &&
          inn.entrance.every(point) &&
          regionBoolean([ring(inn.court)], [ring(inn.footprint)], "difference").every(r => regionArea(r) < 1e-3) &&
          regionBoolean([ring(inn.footprint)], domain, "difference").every(r => regionArea(r) < 1e-3) &&
          !regionBoolean([ring(inn.footprint)], water, "intersection").some(r => regionArea(r) > 1e-3)
      );
    return ok ? [] : ["inns"];
  } catch {
    return ["inns"];
  }
}
