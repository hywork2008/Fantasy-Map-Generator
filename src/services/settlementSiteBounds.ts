/**
 * Where a relocated town may stand (docs/plan/estuary-port-pair-relocation.md §4.1–4.2): FMG keeps one
 * town per cell, so waterfront settlement moves a town within its own cell and never next to a neighbour.
 */
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";

type Point = readonly [number, number];

/** A relocated pair may close to this fraction of their original cell-centre distance, no nearer. */
export const MIN_CELL_SPACING_FRACTION = 0.5;

function insidePolygon(p: Point, ring: readonly (readonly number[])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function distanceToRing(p: Point, ring: readonly (readonly number[])[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)));
  }
  return best;
}

const cellRing = (pack: Pick<PackedGraph, "cells" | "vertices">, cellId: number) =>
  (pack.cells.v[cellId] ?? []).map((v: number) => pack.vertices.p[v]);

/**
 * The point (map units) lies in the town's own cell, or at most half a town radius beyond it on a
 * neighbouring land cell of the same landmass that holds no other town (a cell too small for the town).
 */
export function siteWithinHomeCell(
  pack: Pick<PackedGraph, "cells" | "vertices">,
  cellId: number,
  burgId: number | undefined,
  point: Point,
  radiusMapUnits: number
): boolean {
  const home = cellRing(pack, cellId);
  if (home.length < 3 || insidePolygon(point, home)) return true;
  if (!(distanceToRing(point, home) <= radiusMapUnits / 2)) return false;
  const { cells } = pack;
  const under = Array.from(cells.c[cellId] ?? [], Number).find(id => insidePolygon(point, cellRing(pack, id)));
  if (under === undefined) return false;
  const occupant = cells.burg?.[under] ?? 0;
  return cells.h[under] >= 20 && cells.f[under] === cells.f[cellId] && (!occupant || occupant === burgId);
}

/** Positions of the other towns; `override` holds drafts that are not on the map yet. */
export function siteKeepsSpacing(
  pack: Pick<PackedGraph, "cells" | "burgs">,
  cellId: number,
  burgId: number | undefined,
  point: Point,
  override?: ReadonlyMap<number, Point>
): boolean {
  const home = pack.cells.p[cellId];
  for (const other of pack.burgs) {
    if (!other?.i || other.removed || other.i === burgId || other.cell === cellId) continue;
    const at = override?.get(other.i) ?? [other.x, other.y];
    const centre = pack.cells.p[other.cell];
    const limit = MIN_CELL_SPACING_FRACTION * Math.hypot(home[0] - centre[0], home[1] - centre[1]);
    // Cheap reject first: most towns are far beyond any cell spacing.
    if (Math.abs(at[0] - point[0]) >= limit || Math.abs(at[1] - point[1]) >= limit) continue;
    if (Math.hypot(at[0] - point[0], at[1] - point[1]) < limit) return false;
  }
  return true;
}

/** Both rules for a town's current or proposed position. */
export function siteAllowed(
  pack: Pick<PackedGraph, "cells" | "vertices" | "burgs">,
  burg: Pick<Burg, "i" | "cell">,
  point: Point,
  radiusMapUnits: number,
  override?: ReadonlyMap<number, Point>
): boolean {
  return (
    siteWithinHomeCell(pack, burg.cell, burg.i, point, radiusMapUnits) &&
    siteKeepsSpacing(pack, burg.cell, burg.i, point, override)
  );
}
