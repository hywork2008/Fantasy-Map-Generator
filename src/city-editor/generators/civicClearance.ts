import type { CityDocument, Point } from "../types/document";
import { orientedRectPolylineDistance, polygonHitsTempleYard, templeRectForElement } from "./civicPlacement";
import { circuitRing, polygonOverlaps } from "./fortifications";
import { civicYardMeters } from "./housing";
import { townExtentMeters } from "./settlementExtent";

export function buildingHitsCivicLandmark(document: CityDocument, polygon: Point[]): boolean {
  if (
    (document.defenseCircuits ?? [])
      .filter(c => c.scope === "castle")
      .some(c => polygonOverlaps(polygon, circuitRing(document, c)))
  )
    return true;
  if ((document.cemeteries ?? []).some(c => polygonOverlaps(polygon, c.boundary))) return true;
  const yard = civicYardMeters(townExtentMeters(document.frame));
  for (const element of document.elements) {
    if (element.kind === "temple" && element.point) {
      const rect = templeRectForElement(
        element.point,
        element.sizeMeters,
        element.rotation,
        townExtentMeters(document.frame)
      );
      if (polygonHitsTempleYard(polygon, rect, Math.max(2, yard * 0.25))) return true;
    }
  }
  return false;
}

export function laneHitsCivicLandmark(document: CityDocument, points: Point[]): boolean {
  for (const element of document.elements) {
    if (element.kind === "temple" && element.point) {
      const rect = templeRectForElement(
        element.point,
        element.sizeMeters,
        element.rotation,
        townExtentMeters(document.frame)
      );
      if (orientedRectPolylineDistance(rect, points) < 1.8) return true;
    }
  }
  return false;
}
