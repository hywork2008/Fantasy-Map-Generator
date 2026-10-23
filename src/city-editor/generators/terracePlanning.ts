// Hill towns levelled into terraces: every cell sits flat at a multiple of the terrace step, and the step between
// neighbouring terraces is a retaining wall that streets climb as ramps or stairs.

import type { CityDocument, Id, Point } from "../types/document";
import type { TerrainPlatform } from "../types/terrain";
import { polygonCentroid } from "./geom";
import { facePoints } from "./mesh";

export const DEFAULT_TERRACE_STEP_METERS = 4;
export const TERRACE_OWNER = "terraces";
const MAX_TERRACES = 40;

/**
 * Nested platforms, one per terrace above the lowest: terrace k holds every land cell whose site height lies at least
 * k steps above the lowest cell. Its level is k steps above the highest cell elevation, so the terraces raise the
 * ground and never cut it.
 */
export function planTerraces(
  document: CityDocument,
  siteHeightAt: (point: Point) => number | null,
  stepMeters = DEFAULT_TERRACE_STEP_METERS
): TerrainPlatform[] {
  if (!(stepMeters > 0)) return [];
  const land = Object.values(document.mesh.faces).filter(face => face.properties.water === "land");
  const heights = new Map<Id, number>();
  for (const face of land) {
    const height = siteHeightAt(polygonCentroid(facePoints(document.mesh, face)));
    if (height !== null && Number.isFinite(height)) heights.set(face.id, height);
  }
  if (!heights.size) return [];
  const lowest = Math.min(...heights.values());
  const top = Math.max(...land.map(face => face.properties.elevation));
  const steps = new Map([...heights].map(([id, height]) => [id, Math.floor((height - lowest) / stepMeters)]));
  const highest = Math.min(MAX_TERRACES, Math.max(0, ...steps.values()));
  const terraces: TerrainPlatform[] = [];
  for (let k = 1; k <= highest; k++) {
    const faceIds = [...steps].filter(([, step]) => step >= k).map(([id]) => id);
    if (!faceIds.length) continue;
    terraces.push({
      kind: "platform",
      id: `terrace:${k}`,
      ownerId: TERRACE_OWNER,
      role: "terrace",
      summit: { kind: "faces", faceIds },
      levelMeters: top + k * stepMeters,
      edge: { kind: "cliff" }
    });
  }
  return terraces;
}
