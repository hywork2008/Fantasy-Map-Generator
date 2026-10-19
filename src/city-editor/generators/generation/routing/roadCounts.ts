import type { CityDocument } from "../../../types/document";
import { featureGroupVertices } from "../../features";
import { GEN_PREFIX } from "../constants";

/** `gc:road-*` groups that leave the built-up area. Intramural streets run
 * gate → plaza (one end near the origin) and are ignored. Cape land may never
 * reach the window edge, so "outward from the town" is the test, not the frame. */
export function countExternalApproachRoads(document: CityDocument): number {
  if (document.importedRoadCount !== undefined)
    return document.featureGroups.filter(g => g.kind === "road" && !g.locked && g.sourceRoad && g.segments.length)
      .length;
  const cellSize = Math.max(1, document.frame.blockSizeMeters);
  const core = document.frame.cityRadiusMeters * 0.25;
  let count = 0;
  for (const group of document.featureGroups) {
    if (
      group.kind !== "road" ||
      group.locked ||
      !group.id.startsWith(`${GEN_PREFIX}road-`) ||
      group.id.includes(":part-")
    )
      continue;
    const ids = featureGroupVertices(document, group);
    if (ids.length < 2) continue;
    const start = document.mesh.vertices[ids[0]]?.point;
    const end = document.mesh.vertices[ids.at(-1)!]?.point;
    if (!start || !end) continue;
    const near = Math.min(Math.hypot(start[0], start[1]), Math.hypot(end[0], end[1]));
    const far = Math.max(Math.hypot(start[0], start[1]), Math.hypot(end[0], end[1]));
    if (near >= core && far >= near + cellSize * 0.5) count++;
  }
  return count;
}
