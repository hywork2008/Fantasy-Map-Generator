import { polygonOverlaps } from "../fortifications";
import type { CityDocument, Point } from "../types";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import type { FarmPlot } from "./localInfill";

export interface FarmShed {
  faceId: string;
  polygon: Point[];
}

/** Sparse field-edge stores. The density is a cartographic choice, not a historical census. */
export function farmSheds(document: CityDocument, farms: FarmPlot[], buildings: { polygon: Point[] }[]): FarmShed[] {
  const roads = document.featureGroups.flatMap(group =>
    group.kind === "road"
      ? group.segments.flatMap(ref => {
          const edge = document.mesh.edges[ref.edgeId];
          const a = edge && document.mesh.vertices[edge.a]?.point;
          const b = edge && document.mesh.vertices[edge.b]?.point;
          return a && b ? [{ points: [a, b] as Point[], width: group.style.widthMeters }] : [];
        })
      : []
  );
  if (!roads.length) return [];
  const candidates: Array<FarmShed & { area: number; center: Point }> = [];
  for (const farm of farms) {
    if (farm.kind === "kitchen-garden") continue;
    const area = Math.abs(polygonArea(farm.polygon));
    if (area < 300) continue;
    const center = polygonCentroid(farm.polygon);
    const edge = farm.polygon
      .map((a, index) => {
        const b = farm.polygon[(index + 1) % farm.polygon.length];
        const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const distance = Math.min(...roads.map(road => nearestOnPolyline(mid, road.points).dist));
        return { a, b, mid, distance };
      })
      .sort((a, b) => a.distance - b.distance)[0];
    if (!edge || edge.distance > Math.max(18, document.frame.blockSizeMeters * 0.55)) continue;
    const length = Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]);
    const inward = Math.hypot(center[0] - edge.mid[0], center[1] - edge.mid[1]);
    if (length < 8 || inward < 1) continue;
    const along: Point = [(edge.b[0] - edge.a[0]) / length, (edge.b[1] - edge.a[1]) / length];
    const origin: Point = [
      edge.mid[0] + ((center[0] - edge.mid[0]) * 5) / inward,
      edge.mid[1] + ((center[1] - edge.mid[1]) * 5) / inward
    ];
    const across: Point = [-along[1], along[0]];
    const polygon: Point[] = [-1, 1, 1, -1].map((side, i) => [
      origin[0] + along[0] * side * 3 + across[0] * (i < 2 ? -2 : 2),
      origin[1] + along[1] * side * 3 + across[1] * (i < 2 ? -2 : 2)
    ]);
    if (!polygon.every(point => pointInPolygon(point, farm.polygon))) continue;
    if (roads.some(road => polygon.some(point => nearestOnPolyline(point, road.points).dist < road.width / 2 + 2)))
      continue;
    if (buildings.some(building => polygonOverlaps(polygon, building.polygon))) continue;
    candidates.push({ faceId: farm.faceId, polygon, area, center: origin });
  }

  // Roughly one small store per 1.5 hectares, with a minimum separation.
  const sheds: FarmShed[] = [];
  let areaSinceLast = 0;
  for (const candidate of candidates) {
    areaSinceLast += candidate.area;
    if (areaSinceLast < 15000) continue;
    if (
      sheds.some(
        shed =>
          Math.hypot(
            candidate.center[0] - polygonCentroid(shed.polygon)[0],
            candidate.center[1] - polygonCentroid(shed.polygon)[1]
          ) < 70
      )
    )
      continue;
    sheds.push({ faceId: candidate.faceId, polygon: candidate.polygon });
    areaSinceLast = 0;
  }
  return sheds;
}
