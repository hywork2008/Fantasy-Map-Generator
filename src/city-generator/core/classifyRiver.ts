// S2 — river classification, given a river already routed onto the cell-edge
// graph by riverPath.ts:
//  - `water` cells: centroid within half the local width (or a floor band) of
//    the on-edge polyline.
//  - bank split: land cells, adjacency broken where the centroid-to-centroid
//    link crosses the on-edge polyline. `bank` component 0 = the `cityBank` side.
// See docs/city-generator/design.md §4.

import { nearestOnPolyline, polylineCrossesSegment, sideOfPolyline } from "./geom";
import type { Cell, Point } from "./types";

export interface RiverBand {
  /** Polyline that lies on Voronoi cell edges (riverPath.ts `edgePoints`). */
  edgePoints: Point[];
  /** Full width per `edgePoints` vertex. */
  widths: number[];
  cityBank: "left" | "right";
}

export interface RiverClassification {
  /** Cells the river runs over — no buildings here. */
  water: Set<number>;
  /** land cell id → bank component; 0 = the `cityBank` side. Sea / water omitted. */
  bank: Map<number, number>;
}

export function classifyRiver(
  cells: Cell[],
  sea: Set<number>,
  rivers: RiverBand[],
  minBandMeters: number
): RiverClassification {
  const water = new Set<number>();
  for (const river of rivers) {
    for (const cell of cells) {
      if (sea.has(cell.id) || water.has(cell.id)) continue;
      const hit = nearestOnPolyline(cell.centroid, river.edgePoints);
      const halfWidth = (river.widths[Math.min(hit.segIndex, river.widths.length - 1)] ?? 0) / 2;
      if (hit.dist <= Math.max(halfWidth, minBandMeters)) water.add(cell.id);
    }
  }

  return { water, bank: splitBanks(cells, sea, water, rivers) };
}

function splitBanks(cells: Cell[], sea: Set<number>, water: Set<number>, rivers: RiverBand[]): Map<number, number> {
  const land = cells.filter(c => !sea.has(c.id) && !water.has(c.id));
  const landSet = new Set(land.map(c => c.id));
  const byId = new Map(cells.map(c => [c.id, c]));
  const comp = new Map<number, number>();

  let next = 0;
  for (const start of land) {
    if (comp.has(start.id)) continue;
    comp.set(start.id, next);
    const queue = [start.id];
    while (queue.length > 0) {
      const cur = byId.get(queue.pop() as number) as Cell;
      for (const nId of cur.neighbors) {
        if (!landSet.has(nId) || comp.has(nId)) continue;
        const nb = byId.get(nId) as Cell;
        if (rivers.some(r => polylineCrossesSegment(r.edgePoints, cur.centroid, nb.centroid))) continue;
        comp.set(nId, next);
        queue.push(nId);
      }
    }
    next++;
  }

  const primary = rivers[0];
  if (!primary || next <= 1) return comp;

  const wantLeft = primary.cityBank === "left";
  const netSide = new Map<number, number>();
  const size = new Map<number, number>();
  for (const cell of land) {
    const c = comp.get(cell.id) as number;
    netSide.set(c, (netSide.get(c) ?? 0) + Math.sign(sideOfPolyline(cell.centroid, primary.edgePoints)));
    size.set(c, (size.get(c) ?? 0) + 1);
  }
  let mainComp = 0;
  let bestRank = Number.NEGATIVE_INFINITY;
  for (const [c, s] of size) {
    const matches = wantLeft ? (netSide.get(c) ?? 0) > 0 : (netSide.get(c) ?? 0) < 0;
    const rank = (matches ? 1e6 : 0) + s;
    if (rank > bestRank) {
      bestRank = rank;
      mainComp = c;
    }
  }
  for (const [id, c] of comp) comp.set(id, c === mainComp ? 0 : c + 1);
  return comp;
}
