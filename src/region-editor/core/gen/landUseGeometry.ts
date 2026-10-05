import { pointInPolygon, segmentIntersection } from "../geometry";
import type { Point } from "../types";

export {
  approximateSlope,
  clipConvex,
  createFieldNoise,
  landscapeNoise,
  lineBuffer,
  polygonArea,
  rectangle,
  signedArea,
  subtractConvex,
  trimToArea
} from "../../../generators/landUseGeometry";
/** Includes containment and edge crossings, including narrow water crossing a whole parcel. */
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  if (!a.length || !b.length) return false;
  if (a.some(p => pointInPolygon(p, b)) || b.some(p => pointInPolygon(p, a))) return true;
  return a.some((p, i) =>
    b.some((q, j) => segmentIntersection(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length]).intersects)
  );
}
