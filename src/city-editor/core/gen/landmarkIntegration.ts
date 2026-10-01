import { accessCorridor, landmarkReservationHits, polygonIntersectsLandmark } from "../landmarks";
import type { CityDocument, LandmarkPolygon, Point } from "../types";
import type { BuildingLot } from "./buildingLots";
import { nearestOnPolyline, polygonArea } from "./geom";
import { convexInfillParts, insetConvexKernel, longestFrame } from "./lotGeometry";
import { plotArea, subtractConvex } from "./parcelGeometry";

export interface LandmarkStreet {
  points: Point[];
  widthMeters: number;
}

/** Convex filled pieces retain holes instead of treating courtyards as reserved ground. */
export function landmarkReservationParts(document: CityDocument): Point[][] {
  const shapes: LandmarkPolygon[] = (document.landmarks ?? []).flatMap(instance => [
    ...instance.site,
    ...instance.accesses.flatMap(access => accessCorridor(access.points, access.widthMeters))
  ]);
  return shapes.flatMap(shape => {
    let pieces = convexInfillParts(shape.outer);
    for (const hole of shape.holes)
      for (const cut of convexInfillParts(hole)) pieces = pieces.flatMap(piece => subtractConvex(piece, cut, 0.001));
    return pieces;
  });
}

export function landmarkStreets(document: CityDocument, lanes: ReadonlyArray<LandmarkStreet> = []): LandmarkStreet[] {
  const roads = document.featureGroups.flatMap(group =>
    group.kind === "road"
      ? group.segments.flatMap(ref => {
          const edge = document.mesh.edges[ref.edgeId];
          const a = document.mesh.vertices[edge?.a]?.point;
          const b = document.mesh.vertices[edge?.b]?.point;
          return a && b ? [{ points: [a, b], widthMeters: group.style.widthMeters }] : [];
        })
      : []
  );
  return [...roads, ...lanes];
}

/** Replaces a hit building with one new, smaller whole building only when its residual plot has frontage. */
export function rebuildLandmarkHousing(
  document: CityDocument,
  buildings: BuildingLot[],
  lanes: ReadonlyArray<LandmarkStreet> = []
): BuildingLot[] {
  if (!document.landmarks?.length) return buildings;
  const reserved = landmarkReservationParts(document);
  const streets = landmarkStreets(document, lanes);
  return buildings.flatMap((building, index) => {
    if (
      !document.landmarks!.some(
        instance =>
          polygonIntersectsLandmark(building.polygon, instance.site) ||
          instance.accesses.some(access =>
            accessCorridor(access.points, access.widthMeters).some(part =>
              polygonIntersectsLandmark(building.polygon, [part])
            )
          )
      )
    )
      return [building];
    if (building.landmark || (building.uses && !building.uses.includes("residential"))) return [];
    let residual = convexInfillParts(building.polygon);
    for (const cut of reserved) residual = residual.flatMap(part => subtractConvex(part, cut, 0.001));
    const originalArea = plotArea(building.polygon);
    const candidates = residual
      .filter(part => plotArea(part) >= Math.max(20, originalArea * 0.35) && longestFrame(part).across >= 3.5)
      .map(part =>
        insetConvexKernel(
          part,
          part.map(() => 0.65)
        )
      )
      .filter(part => part.length >= 3 && plotArea(part) >= Math.max(18, originalArea * 0.3))
      .filter(part => {
        const contact = part.some(point =>
          streets.some(street => nearestOnPolyline(point, street.points).dist <= street.widthMeters / 2 + 6)
        );
        return contact && !landmarkReservationHits(document, part);
      })
      .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
    if (!candidates.length) return [];
    return [
      {
        ...building,
        id: `${building.id ?? `${building.faceId}-${index}`}:landmark-rebuilt`,
        polygon: candidates[0]
      }
    ];
  });
}
