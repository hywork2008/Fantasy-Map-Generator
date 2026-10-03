import { facePoints } from "../mesh";
import type { CityDocument, Id, Point } from "../types";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "./geom";

/** Port geometry follows the rendered physical bank, independent of coarse
 * editing cells, whose shared water edges can be hundreds of metres offshore. */
export function riverPortShore(document: CityDocument, faceId: Id) {
  if (!document.waterAccess?.port.river) return null;
  const face = document.mesh.faces[faceId];
  if (face?.properties.water !== "land" || face.properties.ward !== "harbor") return null;
  const land = facePoints(document.mesh, face);
  const center = polygonCentroid(land);
  const candidates = (document.waterAreas ?? []).flatMap((area, index) => {
    if (area.kind !== "river" || area.polygon.length < 3) return [];
    const dry = land.filter(p => !pointInPolygon(p, area.polygon));
    if (!dry.length) return [];
    const origin = pointInPolygon(center, area.polygon) ? polygonCentroid(dry) : center;
    const bank = [...area.polygon, area.polygon[0]];
    const hit = nearestOnPolyline(origin, bank);
    const a = bank[hit.segIndex],
      b = bank[hit.segIndex + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 10) return [];
    const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const along = land.map(p => (p[0] - a[0]) * tangent[0] + (p[1] - a[1]) * tangent[1]);
    const lo = Math.max(0, Math.min(...along));
    const hi = Math.min(length, Math.max(...along));
    if (hi - lo < 10) return [];
    const at = (d: number): Point => [a[0] + tangent[0] * d, a[1] + tangent[1] * d];
    let inward: Point = [-tangent[1], tangent[0]];
    const middle = at((lo + hi) / 2);
    if (pointInPolygon([middle[0] + inward[0], middle[1] + inward[1]], area.polygon)) inward = [-inward[0], -inward[1]];
    return [
      {
        a: at(lo),
        b: at(hi),
        inward,
        water: area.polygon,
        length: hi - lo,
        riverId: `river-area:${index}`,
        distance: hit.dist
      }
    ];
  });
  return candidates.sort((a, b) => a.distance - b.distance)[0] ?? null;
}
