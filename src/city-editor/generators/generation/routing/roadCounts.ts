import type { CityDocument } from "../../../types/document";
import { featureGroupVertices } from "../../features";
import { GEN_PREFIX } from "../constants";

/** Count external approaches, excluding streets even after their endpoints
 * change. Legacy roads without a purpose still use the geometric test: cape
 * land may never reach the frame, so require outward travel from the town. */
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
      group.roadRole === "street" ||
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
