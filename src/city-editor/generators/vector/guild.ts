import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorPolygon } from "../../types/vector/generation";
import { regionArea, regionBoolean } from "./geometry/regions";
import { simpleContour } from "./geometry/surfaces";
import { allVectorWater } from "./geometry/water";

const ring = (outer: Point[]): VectorPolygon => ({ outer, holes: [] });

/** Ground the guilds keep: each hall, its belfry and each yard. */
export function guildReservations(doc: VectorCityDocument): VectorPolygon[] {
  const g = doc.environment?.guilds;
  if (!g) return [];
  return [
    ...g.halls.flatMap(h => [ring(h.footprint), ...(h.tower ? [ring(h.tower)] : [])]),
    ...g.yards.map(y => ring(y.polygon))
  ];
}

const point = (v: unknown): v is Point =>
  Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number" && Number.isFinite(n));
const polygon = (v: unknown): v is Point[] =>
  Array.isArray(v) && v.length >= 3 && v.length <= 64 && v.every(point) && simpleContour(v as Point[], true);

/** Stored halls and yards are simple rings on dry land inside the site, apart from each other. */
export function validateVectorGuilds(doc: VectorCityDocument): string[] {
  const g = doc.environment?.guilds;
  if (g === undefined) return [];
  try {
    if (!Array.isArray(g.halls) || !Array.isArray(g.yards) || g.halls.length + g.yards.length > 64) return ["guilds"];
    const water = allVectorWater(doc),
      domain = doc.site?.domain ?? [],
      pieces = [...g.halls.flatMap(h => [h.footprint, ...(h.tower ? [h.tower] : [])]), ...g.yards.map(y => y.polygon)];
    const ok =
      g.halls.every(h => typeof h.id === "string" && typeof h.name === "string" && h.ridge.every(point)) &&
      g.yards.every(y => typeof y.id === "string" && typeof y.kind === "string") &&
      new Set([...g.halls, ...g.yards].map(x => x.id)).size === g.halls.length + g.yards.length &&
      pieces.every(
        p =>
          polygon(p) &&
          regionBoolean([ring(p)], domain, "difference").every(r => regionArea(r) < 1e-3) &&
          !regionBoolean([ring(p)], water, "intersection").some(r => regionArea(r) > 1e-3)
      );
    return ok ? [] : ["guilds"];
  } catch {
    return ["guilds"];
  }
}
