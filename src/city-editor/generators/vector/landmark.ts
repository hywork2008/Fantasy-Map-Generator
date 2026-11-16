import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorPolygon } from "../../types/vector/generation";
import { regionArea, regionBoolean } from "./geometry/regions";
import { allVectorWater } from "./geometry/water";

const ring = (outer: Point[]): VectorPolygon => ({ outer, holes: [] });
const disc = (center: Point, radius: number, steps = 12): Point[] =>
  Array.from({ length: steps }, (_, i): Point => {
    const t = (i / steps) * Math.PI * 2;
    return [center[0] + Math.cos(t) * radius, center[1] + Math.sin(t) * radius];
  });

/** The ground a windmill's sails sweep, as the mesh editor claims it. */
export const windmillSweep = (mill: { center: Point; sailLength: number }) => disc(mill.center, mill.sailLength + 1.2);
/** The gallows mound, as the mesh editor claims it. */
export const gallowsMound = (gallows: { center: Point }) => disc(gallows.center, 8);

/** Ground the windmills and the gallows keep. */
export const openLandmarkReservations = (doc: VectorCityDocument): VectorPolygon[] => {
  const marks = doc.environment?.landmarks;
  return marks
    ? [...marks.windmills.map(m => ring(windmillSweep(m))), ...marks.gallows.map(g => ring(gallowsMound(g)))]
    : [];
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const point = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && v.every(finite);

/** Stored windmills and gallows stand on dry land in the frame. */
export function validateVectorOpenLandmarks(doc: VectorCityDocument): string[] {
  const marks = doc.environment?.landmarks;
  if (marks === undefined) return [];
  try {
    const water = allVectorWater(doc),
      half = doc.frame.extentMeters / 2;
    // They stand on open ground in the frame, beyond the site's urban land as often as not.
    const sited = (polygon: Point[]) =>
      polygon.every(q => Math.abs(q[0]) <= half && Math.abs(q[1]) <= half) &&
      !regionBoolean([ring(polygon)], water, "intersection").some(r => regionArea(r) > 1e-3);
    const ok =
      Array.isArray(marks.windmills) &&
      Array.isArray(marks.gallows) &&
      marks.windmills.length <= 16 &&
      marks.gallows.length <= 2 &&
      new Set([...marks.windmills, ...marks.gallows].map(m => m.id)).size ===
        marks.windmills.length + marks.gallows.length &&
      marks.windmills.every(
        m =>
          ["post", "tower"].includes(m.kind) &&
          point(m.center) &&
          [m.baseRadius, m.facing, m.sailAngle, m.sailLength].every(finite) &&
          m.baseRadius > 0 &&
          m.sailLength > m.baseRadius &&
          sited(windmillSweep(m))
      ) &&
      marks.gallows.every(
        g =>
          point(g.center) &&
          finite(g.moundRadius) &&
          g.moundRadius > 0 &&
          Array.isArray(g.pillars) &&
          g.pillars.length <= 4 &&
          g.pillars.every(point) &&
          Array.isArray(g.path) &&
          g.path.every(point) &&
          sited(gallowsMound(g))
      );
    return ok ? [] : ["landmarks"];
  } catch {
    return ["landmarks"];
  }
}
