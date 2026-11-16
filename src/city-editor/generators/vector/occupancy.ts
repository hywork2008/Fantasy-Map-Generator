import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorFabricCell } from "../../types/vector/fabric";
import type { VectorPolygon } from "../../types/vector/generation";
import { cellHouseCount, cellHouseRing, FABRIC_QUANTUM_METERS } from "./fabric/pack";
import { type PathSurface, surfacesOverlap } from "./geometry/surfaces";

/** Houses lie inside their street block, so the block ring's box bounds them. */
function cellMeets(cell: VectorFabricCell, box: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < cell.ring.length; i += 2) {
    minX = Math.min(minX, cell.ring[i]);
    maxX = Math.max(maxX, cell.ring[i]);
    minY = Math.min(minY, cell.ring[i + 1]);
    maxY = Math.max(maxY, cell.ring[i + 1]);
  }
  const q = FABRIC_QUANTUM_METERS,
    [x, y] = cell.origin;
  return x + maxX * q >= box.minX && x + minX * q <= box.maxX && y + maxY * q >= box.minY && y + minY * q <= box.maxY;
}

/** "reserved": everything a building keeps clear (its reserved land, else its site). "site": the plot alone.
 * Generated fabric houses have one polygon for both. */
export type VectorSiteMode = "reserved" | "site";

/** Every occupied site in a fixed order: placements in document order, then adopted fabric houses.
 * Obstacle checks read this instead of `placements`, because generated houses live in `fabric` (native v8). */
export function vectorOccupiedSites(
  doc: Readonly<VectorCityDocument>,
  mode: VectorSiteMode,
  excludePlacementId?: string,
  /** Only street blocks whose ring box meets this box are decoded; placements are always listed. */
  near?: { minX: number; minY: number; maxX: number; maxY: number }
): VectorPolygon[] {
  const sites: VectorPolygon[] = [];
  for (const p of Object.values(doc.placements)) {
    if (p.id === excludePlacementId) continue;
    if (mode === "reserved") sites.push(...(p.building?.reserved ?? [p.site]));
    else sites.push(p.site);
  }
  for (const cell of Object.values(doc.fabric?.cells ?? {})) {
    if (near && !cellMeets(cell, near)) continue;
    const detached = new Set(cell.detached);
    for (let i = 0; i < cellHouseCount(cell); i++)
      if (!detached.has(i)) sites.push({ outer: cellHouseRing(cell, i), holes: [] });
  }
  return sites;
}

/** True when `surface` overlaps any occupied site. Street blocks and sites away from the surface's box are skipped
 * without decoding; the box is padded so touching within the overlap tolerance still counts. */
export function overlapsOccupiedSites(
  doc: Readonly<VectorCityDocument>,
  surface: PathSurface,
  mode: VectorSiteMode = "reserved"
): boolean {
  const pad = 1e-6,
    box = {
      minX: Math.min(...surface.outer.map(p => p[0])) - pad,
      minY: Math.min(...surface.outer.map(p => p[1])) - pad,
      maxX: Math.max(...surface.outer.map(p => p[0])) + pad,
      maxY: Math.max(...surface.outer.map(p => p[1])) + pad
    };
  return vectorOccupiedSites(doc, mode, undefined, box).some(
    p =>
      p.outer.some(q => q[0] >= box.minX) &&
      p.outer.some(q => q[0] <= box.maxX) &&
      p.outer.some(q => q[1] >= box.minY) &&
      p.outer.some(q => q[1] <= box.maxY) &&
      surfacesOverlap(surface, p)
  );
}
