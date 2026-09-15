// S3 — urban core. Flood-fill the built-up area outward from the town centre over
// eligible cells (land, on the main bank). The default stop is a cell COUNT
// derived from the intended city disc: N = π R² / mean cell area, so hex and
// Voronoi meshes of different cell size cover the same urban area. Pulled
// toward gate bearings so the fabric reaches the roads. On a coast the cost is
// an ELLIPSE elongated along the shoreline — a coastal city is a ribbon along
// the shore, not a disc. A thin `outskirts` ribbon follows each road.
// See docs/city-generator/design.md §4.2.

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
  /**
   * TownGeneratorTS-style count cutoff (towngen-comparison.md §2.1, A-1): take
   * the first N cells in ascending-cost fill order, rather than every cell
   * under a radius threshold — a defined-size "15 fat patches" core reads as a
   * stable, deliberate town outline; a radius boundary lets the fill fray into
   * the fine cells right at its edge. Unset (the default) derives N from the
   * disc a city of this radius would cover given this mesh's mean cell area,
   * `π·R² / meanArea` (TownGen's 15 for its own reference scale); pass an
   * explicit count to override it (the ③ debug stepper's nPatches field).
   */
  nPatches: number | null = null,
  /** Fallback when every cell polygon is degenerate; otherwise ignored. */
  cellSizeMeters = cityRadiusMeters / 3.5
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

  const targetN = nPatches ?? autoPatchCount(cells, cityRadiusMeters, cellSizeMeters);
  const frontier: Cell[] = [center];
  const seen = new Set<number>([center.id]);
  while (frontier.length > 0 && urban.size < targetN) {
    frontier.sort((a, b) => cost(a) - cost(b));
    const cell = frontier.shift() as Cell;
    urban.add(cell.id);
    stages.push({ cellId: cell.id, urban: [...urban] });
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

/** How many cells fill a disc of radius `cityRadiusMeters` on this mesh. */
function autoPatchCount(cells: Cell[], cityRadiusMeters: number, cellSizeMeters: number): number {
  const meanArea = meanCellArea(cells);
  const cellArea = meanArea > 0 ? meanArea : Math.max(1, cellSizeMeters) ** 2;
  return Math.max(1, Math.round((Math.PI * cityRadiusMeters * cityRadiusMeters) / cellArea));
}

function meanCellArea(cells: Cell[]): number {
  let sum = 0;
  let n = 0;
  for (const cell of cells) {
    if (cell.polygon.length < 3) continue;
    const area = Math.abs(polygonArea(cell.polygon));
    if (!(area > 0) || !Number.isFinite(area)) continue;
    sum += area;
    n++;
  }
  return n > 0 ? sum / n : 0;
}
