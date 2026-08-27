// S1 — sea / land. Tag a cell `sea` when its centroid lies on the water side of
// the shoreline, then a conservative majority-vote pass removes slivers.
// Landlocked burgs (no shoreline) skip this entirely — no sea cells.
// See docs/city-generator/design.md §4.2.

import { azimuthToVec, nearestOnPolyline } from "./geom";
import type { Cell } from "./types";

export function classifySea(
  cells: Cell[],
  shoreline: readonly [number, number][] | null,
  waterAzimuthDeg: number
): Set<number> {
  const sea = new Set<number>();
  if (!shoreline || shoreline.length < 2) return sea;

  const shore = shoreline as [number, number][];
  const water = azimuthToVec(waterAzimuthDeg);
  for (const cell of cells) {
    const q = nearestOnPolyline(cell.centroid, shore).point;
    const toward = (cell.centroid[0] - q[0]) * water[0] + (cell.centroid[1] - q[1]) * water[1];
    if (toward > 0) sea.add(cell.id);
  }

  smoothMembership(cells, sea, 2);
  return sea;
}

/** Flip a cell when ≥ 75% of its (≥ 3) neighbors disagree. Simultaneous per pass. */
function smoothMembership(cells: Cell[], set: Set<number>, passes: number): void {
  const byId = new Map(cells.map(c => [c.id, c]));
  for (let pass = 0; pass < passes; pass++) {
    const flips: number[] = [];
    for (const cell of cells) {
      const neighbors = cell.neighbors.map(id => byId.get(id)).filter((c): c is Cell => c !== undefined);
      if (neighbors.length < 3) continue;
      const mine = set.has(cell.id);
      const disagree = neighbors.filter(n => set.has(n.id) !== mine).length;
      if (disagree / neighbors.length >= 0.75) flips.push(cell.id);
    }
    for (const id of flips) {
      if (set.has(id)) set.delete(id);
      else set.add(id);
    }
  }
}
