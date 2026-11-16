import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorPolygon } from "../../types/vector/generation";
import { pointInPolygon } from "../geom";
import type { Monastery } from "../monasteryLayout";
import { containsRegion, regionArea, regionBoolean } from "./geometry/regions";
import { simpleContour } from "./geometry/surfaces";
import { allVectorWater } from "./geometry/water";

const ring = (outer: Point[]): VectorPolygon => ({ outer, holes: [] });

/** Ground a religious house keeps: its whole precinct. */
export const monasteryReservations = (m: Monastery): VectorPolygon[] => [ring(m.precinct)];

const point = (v: unknown): v is Point =>
  Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number" && Number.isFinite(n));
const polygon = (v: unknown): v is Point[] =>
  Array.isArray(v) && v.length >= 3 && v.length <= 512 && v.every(point) && simpleContour(v as Point[], true);

/** A stored precinct is a simple ring on dry land in the site, with its buildings and courts inside it. */
export function validateVectorMonasteries(doc: VectorCityDocument): string[] {
  const houses = doc.environment?.monasteries;
  if (houses === undefined) return [];
  if (!houses || typeof houses !== "object" || Array.isArray(houses) || Object.keys(houses).length > 16)
    return ["monasteries"];
  const water = allVectorWater(doc),
    domain = doc.site?.domain ?? [];
  return Object.entries(houses).flatMap(([id, m]) => {
    try {
      const inside = (p: Point[]) => p.every(q => pointInPolygon(q, m.precinct) || nearRing(q, m.precinct));
      const ok =
        m.id === id &&
        /^monastery:[A-Za-z0-9:._/-]{1,110}$/.test(id) &&
        ["abbey", "friary", "orthodoxMonastery"].includes(m.kind) &&
        typeof m.name === "string" &&
        polygon(m.precinct) &&
        Array.isArray(m.wall) &&
        m.wall.every(point) &&
        point(m.gate) &&
        m.buildings.every(b => polygon(b.polygon) && inside(b.polygon)) &&
        m.courts.every(c => polygon(c.polygon) && inside(c.polygon)) &&
        m.trees.every(t => point(t.at) && Number.isFinite(t.radius)) &&
        regionBoolean([ring(m.precinct)], domain, "difference").every(r => regionArea(r) < 1) &&
        !regionBoolean([ring(m.precinct)], water, "intersection").some(r => regionArea(r) > 1e-3) &&
        containsRegion(domain, m.gate);
      return ok ? [] : [`monastery:${id}`];
    } catch {
      return [`monastery:${id}`];
    }
  });
}

function nearRing(p: Point, ring: Point[]) {
  return ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < 0.05;
  });
}
