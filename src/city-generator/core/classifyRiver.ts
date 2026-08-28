// S2 — river classification, given a river already routed onto the cell-edge
// graph by riverPath.ts. The river is drawn as a band on the cell edges, so no
// cell is tagged as "river water"; the only structural effect is the bank split:
//  - land cells, adjacency broken where the centroid-to-centroid link crosses
//    the on-edge polyline. `bank` component 0 = the side the burg sits on.
// See docs/city-generator/design.md §4.

import { polylineCrossesSegment } from "./geom";
import type { Cell, Point } from "./types";

export interface RiverBand {
  /** Polyline that lies on Voronoi cell edges (riverPath.ts `edgePoints`). */
  edgePoints: Point[];
}

export interface RiverClassification {
  /** land cell id → bank component; 0 = the burg's side. Sea cells omitted. */
  bank: Map<number, number>;
}

export function classifyRiver(cells: Cell[], sea: Set<number>, rivers: RiverBand[]): RiverClassification {
  return { bank: splitBanks(cells, sea, rivers) };
}

function splitBanks(cells: Cell[], sea: Set<number>, rivers: RiverBand[]): Map<number, number> {
  const land = cells.filter(c => !sea.has(c.id));
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

  if (next <= 1) return comp;

  // The main (city) side is whichever component the burg sits in — FMG placed the
  // burg, so the land cell nearest the origin decides. Handles "town between two
  // rivers" (origin lands in the thin middle sliver) with no bank heuristic.
  let originComp = -1;
  let bestR = Number.POSITIVE_INFINITY;
  for (const cell of land) {
    const r = cell.centroid[0] ** 2 + cell.centroid[1] ** 2;
    if (r < bestR) {
      bestR = r;
      originComp = comp.get(cell.id) as number;
    }
  }
  if (originComp < 0) return comp;
  for (const [id, c] of comp) comp.set(id, c === originComp ? 0 : c + 1);
  return comp;
}
