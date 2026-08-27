// S3 — urban core. Flood-fill the built-up area outward from the town center over
// eligible cells (land, dry, on the main bank), bounded by the city radius but
// pulled toward gate bearings so the fabric reaches the roads. A thin ribbon of
// `outskirts` follows each road beyond the wall line.
// See docs/city-generator/design.md §4.2.

import { azimuthDelta, vecToAzimuth } from "./geom";
import type { Cell } from "./types";

export interface UrbanContext {
  sea: Set<number>;
  water: Set<number>;
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

export function classifyUrban(
  cells: Cell[],
  ctx: UrbanContext,
  roadBearings: number[],
  cityRadiusMeters: number
): UrbanClassification {
  const urban = new Set<number>();
  const outskirts = new Set<number>();

  const eligible = (c: Cell): boolean => !ctx.sea.has(c.id) && !ctx.water.has(c.id) && (ctx.bank.get(c.id) ?? 0) === 0;

  const radius = (c: Cell): number => Math.hypot(c.centroid[0], c.centroid[1]);
  const gatePull = (c: Cell): number => {
    if (roadBearings.length === 0) return 0;
    const az = vecToAzimuth(c.centroid[0], c.centroid[1]);
    const nearest = Math.min(...roadBearings.map(b => azimuthDelta(az, b)));
    return nearest <= GATE_CONE_DEG ? cityRadiusMeters * GATE_PULL : 0;
  };
  const cost = (c: Cell): number => radius(c) - gatePull(c);

  const byId = new Map(cells.map(c => [c.id, c]));
  const center = cells.filter(eligible).sort((a, b) => radius(a) - radius(b))[0];
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
    if (radius(cell) > cityRadiusMeters * RIBBON_REACH || roadBearings.length === 0) continue;
    const az = vecToAzimuth(cell.centroid[0], cell.centroid[1]);
    if (Math.min(...roadBearings.map(b => azimuthDelta(az, b))) <= RIBBON_CONE_DEG) outskirts.add(cell.id);
  }

  return { urban, outskirts };
}
