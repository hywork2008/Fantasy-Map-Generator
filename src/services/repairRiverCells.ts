import type { WorldContext } from "../context/worldContext";

/**
 * Older river generation could append a lake cell twice (inlet cell == outlet cell).
 * The repeated cell is a zero-length reach that makes canonical river geometry fail
 * with "invalid-curve", leaving burgs on that river unplaced. Returns repaired river ids.
 */
export function removeRepeatedRiverCells(world: WorldContext): Set<number> {
  const repaired = new Set<number>();
  for (const river of world.pack.rivers ?? []) {
    const cells = river.cells;
    if (!Array.isArray(cells) || !cells.some((cell, i) => i > 0 && cell === cells[i - 1])) continue;
    const keep = cells.map((cell, i) => i === 0 || cell !== cells[i - 1]);
    if (river.points?.length === cells.length) river.points = river.points.filter((_, i) => keep[i]);
    river.cells = cells.filter((_, i) => keep[i]);
    repaired.add(river.i);
  }
  return repaired;
}

/** Burgs left unplaced by a repaired river; they need river-bank placement again. */
export function burgsUnplacedOnRivers(world: WorldContext, riverIds: ReadonlySet<number>): number[] {
  const { burgs, cells } = world.pack;
  return (burgs ?? []).flatMap(burg =>
    burg?.i &&
    !burg.removed &&
    burg.riverSiteStatus?.status === "unresolved" &&
    (riverIds.has(burg.riverSiteStatus.riverId) || riverIds.has(cells.r[burg.cell]))
      ? [burg.i]
      : []
  );
}
