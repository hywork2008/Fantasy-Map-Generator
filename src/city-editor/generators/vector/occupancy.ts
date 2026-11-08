import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorPolygon } from "../../types/vector/generation";
import { cellHouseCount, cellHouseRing } from "./fabric/pack";

/** "reserved": everything a building keeps clear (its reserved land, else its site). "site": the plot alone.
 * Generated fabric houses have one polygon for both. */
export type VectorSiteMode = "reserved" | "site";

/** Every occupied site in a fixed order: placements in document order, then adopted fabric houses.
 * Obstacle checks read this instead of `placements`, because generated houses live in `fabric` (native v8). */
export function vectorOccupiedSites(
  doc: Readonly<VectorCityDocument>,
  mode: VectorSiteMode,
  excludePlacementId?: string
): VectorPolygon[] {
  const sites: VectorPolygon[] = [];
  for (const p of Object.values(doc.placements)) {
    if (p.id === excludePlacementId) continue;
    if (mode === "reserved") sites.push(...(p.building?.reserved ?? [p.site]));
    else sites.push(p.site);
  }
  for (const cell of Object.values(doc.fabric?.cells ?? {})) {
    const detached = new Set(cell.detached);
    for (let i = 0; i < cellHouseCount(cell); i++)
      if (!detached.has(i)) sites.push({ outer: cellHouseRing(cell, i), holes: [] });
  }
  return sites;
}
