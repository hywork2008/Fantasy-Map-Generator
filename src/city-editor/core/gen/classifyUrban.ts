// Grow a connected urban core to an actual polygon-area budget.
// Explicit nPatches remains a count-based diagnostic override.

import { azimuthDelta, polygonArea, vecToAzimuth } from "./geom";
import type { Cell, Point, UrbanStage } from "./types";

export interface UrbanContext {
  sea: Set<number>;
  /** land cell id → bank component (0 = city side). */
  bank: Map<number, number>;
}

export interface UrbanClassification {
  urban: Set<number>;
  outskirts: Set<number>;
  /** S3 flood-fill in fill order, one entry per cell admitted to `urban` — lets
   * the "Urban core evolution" debug slider step through the growth one loop
   * at a time (towngen-comparison.md §2.1). */
  stages: UrbanStage[];
}

const GATE_CONE_DEG = 22;
const GATE_PULL = 0.12;
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
  shoreTangent: Point | null = null,
  /** Explicit diagnostic cell-count override; default uses accumulated area. */
  nPatches: number | null = null,
  /** Area fallback for degenerate polygons. */
  cellSizeMeters = cityRadiusMeters / 3.5,
  captureStages = true
): UrbanClassification {
  const urban = new Set<number>();
  const outskirts = new Set<number>();
  const stages: UrbanStage[] = [];

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
    // A continuous, modest pull avoids rectangular fingers at the cone edge.
    return nearest < GATE_CONE_DEG
      ? (cityRadiusMeters * GATE_PULL * (1 + Math.cos((nearest / GATE_CONE_DEG) * Math.PI))) / 2
      : 0;
  };
  const cost = (c: Cell): number => reach(c) - gatePull(c);

  const byId = new Map(cells.map(c => [c.id, c]));
  const center = cells.filter(eligible).sort((a, b) => reach(a) - reach(b))[0];
  if (!center) return { urban, outskirts, stages };

  const targetArea = Math.PI * Math.max(0, cityRadiusMeters) ** 2;
  let admittedArea = 0;
  const frontier: Cell[] = [center];
  const seen = new Set<number>([center.id]);
  while (frontier.length > 0 && (nPatches !== null ? urban.size < nPatches : admittedArea < targetArea)) {
    frontier.sort((a, b) => cost(a) - cost(b));
    const cell = frontier.shift() as Cell;
    urban.add(cell.id);
    const area = Math.abs(polygonArea(cell.polygon));
    admittedArea += Number.isFinite(area) && area > 0 ? area : Math.max(1, cellSizeMeters) ** 2;
    if (captureStages) stages.push({ cellId: cell.id });
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

  return { urban, outskirts, stages };
}
