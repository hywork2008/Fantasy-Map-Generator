// S3 — urban core. Flood-fill the built-up area outward from the town centre over
// eligible cells (land, on the main bank), bounded by the city radius but
// pulled toward gate bearings so the fabric reaches the roads. On a coast the
// bound is an ELLIPSE elongated along the shoreline — a coastal city is a ribbon
// along the shore, not a disc. A thin `outskirts` ribbon follows each road.
// See docs/city-generator/design.md §4.2.

import { azimuthDelta, vecToAzimuth } from "./geom";
import type { Cell, Point } from "./types";

export interface UrbanContext {
  sea: Set<number>;
  /** land cell id → bank component (0 = city side). */
  bank: Map<number, number>;
}

export interface UrbanClassification {
  urban: Set<number>;
  outskirts: Set<number>;
}

const GATE_CONE_DEG = 22;
const GATE_PULL = 0.35;
const RIBBON_CONE_DEG = 15;
const RIBBON_REACH = 1.6;
/** Elliptical reach when a shoreline tangent is known: along-shore vs inland. */
const ALONG_SHORE = 1.9;
const CROSS_SHORE = 0.72;

export function classifyUrban(
  cells: Cell[],
  ctx: UrbanContext,
  roadBearings: number[],
  cityRadiusMeters: number,
  shoreTangent: Point | null = null
): UrbanClassification {
  const urban = new Set<number>();
  const outskirts = new Set<number>();

  const eligible = (c: Cell): boolean => !ctx.sea.has(c.id) && (ctx.bank.get(c.id) ?? 0) === 0;

  // Distance metric: circular inland, elliptical (shore-elongated) on a coast.
  const reach = (c: Cell): number => {
    const [x, y] = c.centroid;
    if (!shoreTangent) return Math.hypot(x, y);
    const along = (x * shoreTangent[0] + y * shoreTangent[1]) / ALONG_SHORE;
    const cross = (-x * shoreTangent[1] + y * shoreTangent[0]) / CROSS_SHORE;
    return Math.hypot(along, cross);
  };
  const gatePull = (c: Cell): number => {
    if (roadBearings.length === 0) return 0;
    const az = vecToAzimuth(c.centroid[0], c.centroid[1]);
    const nearest = Math.min(...roadBearings.map(b => azimuthDelta(az, b)));
    return nearest <= GATE_CONE_DEG ? cityRadiusMeters * GATE_PULL : 0;
  };
  const cost = (c: Cell): number => reach(c) - gatePull(c);

  const byId = new Map(cells.map(c => [c.id, c]));
  const center = cells.filter(eligible).sort((a, b) => reach(a) - reach(b))[0];
  if (!center) return { urban, outskirts };

  const frontier: Cell[] = [center];
  const seen = new Set<number>([center.id]);
  while (frontier.length > 0) {
    frontier.sort((a, b) => cost(a) - cost(b));
    const cell = frontier.shift() as Cell;
    if (cost(cell) > cityRadiusMeters) continue;
    urban.add(cell.id);
    for (const nId of cell.neighbors) {
      if (seen.has(nId)) continue;
      const nb = byId.get(nId);
      if (!nb || !eligible(nb)) continue;
      seen.add(nId);
      frontier.push(nb);
    }
  }

  for (const cell of cells) {
    if (urban.has(cell.id) || !eligible(cell)) continue;
    if (reach(cell) > cityRadiusMeters * RIBBON_REACH || roadBearings.length === 0) continue;
    const az = vecToAzimuth(cell.centroid[0], cell.centroid[1]);
    if (Math.min(...roadBearings.map(b => azimuthDelta(az, b))) <= RIBBON_CONE_DEG) outskirts.add(cell.id);
  }

  return { urban, outskirts };
}
