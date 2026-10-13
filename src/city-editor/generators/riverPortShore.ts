import type { CityDocument, Id, Point } from "../types/document";
import { nearestOnPolyline, pointInPolygon, polygonCentroid, segmentSegmentHit, simplifyPolyline } from "./geom";
import { facePoints } from "./mesh";

/** Port geometry follows the rendered physical bank, independent of coarse
 * editing cells, whose shared water edges can be hundreds of metres offshore. */
export function riverPortShore(document: CityDocument, faceId: Id) {
  if (!document.waterAccess?.port.river) return null;
  const face = document.mesh.faces[faceId];
  if (face?.properties.water !== "land" || face.properties.ward !== "harbor") return null;
  const owners = document.elements.filter(e => e.kind === "harbor" && e.faceIds.includes(faceId));
  if (owners.length && owners.every(e => e.harborKind === "sea")) return null;
  const sources = [
    ...(document.waterAreas ?? []).flatMap((area, index) =>
      area.kind === "river" ? [{ polygon: area.polygon, riverId: `river-area:${index}` }] : []
    ),
    ...(document.importedFixedCrossings?.rivers ?? []).flatMap(river =>
      river.rings.map((ring, index) => ({
        polygon: ring.map(p => [p[0], p[1]] as Point),
        riverId: `fixed-river:${river.id}:${index}`
      }))
    )
  ];
  return physicalShore(facePoints(document.mesh, face), sources);
}

/** Imported FMG coastlines are straight survey lines that ignore the cell
 * grid: a coastal harbour cell's shared sea edge can lie offshore, leaving
 * its whole berth wet. The sea counterpart of `riverPortShore`. */
export function seaPortShore(document: CityDocument, faceId: Id) {
  if (!document.waterAccess?.port.sea) return null;
  const face = document.mesh.faces[faceId];
  if (face?.properties.water !== "land" || face.properties.ward !== "harbor") return null;
  const shore = physicalShore(facePoints(document.mesh, face), seaShoreSources(document));
  return shore && { a: shore.a, b: shore.b, inward: shore.inward, water: shore.water, length: shore.length };
}

/** The imported sea ring containing `point`, for ships berthed on a `seaPortShore`. */
export function seaShoreWater(document: CityDocument, point: Point): Point[] | undefined {
  return seaShoreSources(document).find(source => pointInPolygon(point, source.polygon))?.polygon;
}

function seaShoreSources(document: CityDocument) {
  return (document.importedFixedCrossings?.obstacles ?? []).flatMap(body =>
    body.rings.map(ring => ({ polygon: ring.map(p => [p[0], p[1]] as Point), riverId: "" }))
  );
}

function physicalShore(land: Point[], sources: { polygon: Point[]; riverId: string }[]) {
  const center = polygonCentroid(land);
  const candidates = sources.flatMap(area => {
    if (area.polygon.length < 3) return [];
    const dry = land.filter(p => !pointInPolygon(p, area.polygon));
    if (!dry.length) return [];
    const origin = pointInPolygon(center, area.polygon) ? polygonCentroid(dry) : center;
    const bank = simplifyPolyline(area.polygon, 0.25, true);
    return bank.flatMap((a, i) => {
      const b = bank[(i + 1) % bank.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 6) return [];
      const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
      const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const cuts = [0, 1];
      for (let j = 0; j < land.length; j++) {
        const hit = segmentSegmentHit(a, b, land[j], land[(j + 1) % land.length]);
        if (hit) cuts.push(hit.t);
      }
      const ordered = [...new Set(cuts)].sort((a, b) => a - b);
      return ordered.slice(1).flatMap((hi, j) => {
        const lo = ordered[j];
        if ((hi - lo) * length < 6) return [];
        const middle = at((lo + hi) / 2);
        let inward: Point = [-tangent[1], tangent[0]];
        if (pointInPolygon([middle[0] + inward[0], middle[1] + inward[1]], area.polygon))
          inward = [-inward[0], -inward[1]];
        const root: Point = [middle[0] + inward[0] * 1.2, middle[1] + inward[1] * 1.2];
        // Projecting cell vertices onto a distant bank can create a floating
        // pier. Its landward root must belong to the actual harbour cell.
        if (!pointInPolygon(root, land) || pointInPolygon(root, area.polygon)) return [];
        return [
          {
            a: at(lo),
            b: at(hi),
            inward,
            water: area.polygon,
            length: (hi - lo) * length,
            riverId: area.riverId,
            distance: nearestOnPolyline(origin, [at(lo), at(hi)]).dist
          }
        ];
      });
    });
  });
  return candidates.sort((a, b) => a.distance - b.distance)[0] ?? null;
}
