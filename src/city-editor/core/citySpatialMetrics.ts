import { polygonArea } from "./gen/geom";
import { triangularInfillParts } from "./gen/lotGeometry";
import { intersectConvex } from "./gen/parcelGeometry";
import { facePoints } from "./mesh";
import type { CityDocument, Point } from "./types";

/** Area of finished editing cells, clipped to the displayed square frame.
 * Urban means dry core/outskirts cells, including civic/open-space precincts,
 * not building footprints. Background includes rural cells and water.
 */
export function citySpatialMetrics(document: CityDocument) {
  const frameExtentMeters = document.frame.extentMeters;
  const half = frameExtentMeters / 2;
  const frame: Point[] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half]
  ];
  const frameAreaMeters2 = frameExtentMeters ** 2;
  let meshAreaMeters2 = 0,
    coreAreaMeters2 = 0,
    outskirtsAreaMeters2 = 0;
  for (const face of Object.values(document.mesh.faces)) {
    const area = triangularInfillParts(facePoints(document.mesh, face)).reduce(
      (sum, part) => sum + Math.abs(polygonArea(intersectConvex(part, frame))),
      0
    );
    meshAreaMeters2 += area;
    if (face.properties.water !== "land") continue;
    if (face.properties.settlement === "core") coreAreaMeters2 += area;
    if (face.properties.settlement === "outskirts") outskirtsAreaMeters2 += area;
  }
  const urbanAreaMeters2 = coreAreaMeters2 + outskirtsAreaMeters2;
  const backgroundAreaMeters2 = Math.max(0, frameAreaMeters2 - urbanAreaMeters2);
  const ratio = (area: number, total: number) => (total > 0 ? Math.max(0, Math.min(1, area / total)) : null);
  return {
    frameExtentMeters,
    frameAreaMeters2,
    meshAreaMeters2,
    coreAreaMeters2,
    outskirtsAreaMeters2,
    urbanAreaMeters2,
    backgroundAreaMeters2,
    urbanFrameRatio: ratio(urbanAreaMeters2, frameAreaMeters2),
    backgroundFrameRatio: ratio(backgroundAreaMeters2, frameAreaMeters2),
    urbanMeshRatio: ratio(urbanAreaMeters2, meshAreaMeters2),
    backgroundMeshRatio: ratio(Math.max(0, meshAreaMeters2 - urbanAreaMeters2), meshAreaMeters2),
    meshFrameRatio: ratio(meshAreaMeters2, frameAreaMeters2)
  };
}
