// MIT, independently implemented from the reference city's output geometry.
import { edgeBetween, facePoints } from "../mesh";
import type { CityDocument, Face, Id, Point } from "../types";
import { polygonArea } from "./geom";
import { makeRng } from "./prng";

export interface BuildingLot {
  faceId: Id;
  polygon: Point[];
  landmark: boolean;
}

/** Buildings are derived from the edited mesh, never a second source of street
 * geometry. Per-face random streams keep unrelated edits from shuffling lots. */
export function buildCityBuildings(document: CityDocument): BuildingLot[] {
  const clearance = new Map<Id, number>();
  for (const group of document.featureGroups) {
    const edgeIds =
      group.kind === "river"
        ? group.vertices.slice(1).flatMap((id, i) => {
            const edge = edgeBetween(document.mesh, group.vertices[i], id);
            return edge ? [edge.id] : [];
          })
        : group.segments.map(s => s.edgeId);
    for (const id of edgeIds) clearance.set(id, Math.max(clearance.get(id) ?? 0, group.style.widthMeters / 2 + 3));
  }
  const lots: BuildingLot[] = [];
  for (const face of Object.values(document.mesh.faces)) lots.push(...buildFaceLots(document, face, clearance));
  return lots;
}

function buildFaceLots(document: CityDocument, face: Face, clearance: Map<Id, number>): BuildingLot[] {
  const { water, ward, buildable } = face.properties;
  if (water !== "land" || !buildable || !ward || ward === "empty" || ward === "park") return [];
  if (document.elements.some(e => (e.kind === "plaza" || e.kind === "temple") && e.faceIds.includes(face.id)))
    return [];
  const polygon = facePoints(document.mesh, face);
  if (polygon.length < 3) return [];
  const setbacks = face.boundary.map(ref => {
    const edge = document.mesh.edges[ref.edgeId];
    const otherId = edge.leftFace === face.id ? edge.rightFace : edge.leftFace;
    const other = otherId ? document.mesh.faces[otherId] : null;
    return Math.max(3, clearance.get(ref.edgeId) ?? 0, other && other.properties.water !== "land" ? 6 : 0);
  });
  const block = insetConvexKernel(polygon, setbacks);
  if (block.length < 3 || Math.abs(polygonArea(block)) < 65) return [];
  const rng = makeRng(`lots:${face.id}:${ward}`);
  const landmark = ward === "castle";
  const targetArea = landmark ? 1600 : ward === "merchant" ? 260 : ward === "harbor" ? 300 : 180;
  const result: BuildingLot[] = [];
  const subdivide = (poly: Point[], depth: number): void => {
    const area = Math.abs(polygonArea(poly));
    if (area < 65) return;
    const { axis, min, max, across } = longestFrame(poly);
    const length = max - min;
    if (depth < 10 && area > targetArea * rng.range(1.1, 1.7) && length > 17) {
      const cut = min + length * rng.range(0.42, 0.58);
      // A few wider alleys separate clusters; the remaining lot boundaries
      // leave narrow gaps between neighbouring buildings.
      const gap = depth < 2 && area > 1800 ? 2.6 : 0.85;
      const a = clipHalfPlane(poly, axis, cut - gap / 2);
      const b = clipHalfPlane(poly, [-axis[0], -axis[1]], -cut - gap / 2);
      if (a.length >= 3 && b.length >= 3 && Math.abs(polygonArea(a)) > 60 && Math.abs(polygonArea(b)) > 60) {
        subdivide(a, depth + 1);
        subdivide(b, depth + 1);
        return;
      }
    }
    if (across < 4 || length / across > 5) return;
    const building = insetConvexKernel(
      poly,
      poly.map(() => 0.35)
    );
    if (building.length >= 3) result.push({ faceId: face.id, polygon: building, landmark });
  };
  subdivide(block, 0);
  return result;
}

/** Intersect inward offset half-planes. The result remains inside even a
 * concave edited face; an empty/narrow kernel simply receives no buildings. */
export function insetConvexKernel(poly: Point[], distances: number[]): Point[] {
  const sign = -Math.sign(polygonArea(poly));
  if (!sign || poly.length < 3) return [];
  const xs = poly.map(p => p[0]);
  const ys = poly.map(p => p[1]);
  let result: Point[] = [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
    [Math.min(...xs), Math.max(...ys)]
  ];
  for (let i = 0; i < poly.length && result.length >= 3; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-8) continue;
    const normal: Point = [(sign * (b[1] - a[1])) / length, (sign * (a[0] - b[0])) / length];
    result = clipHalfPlane(result, normal, a[0] * normal[0] + a[1] * normal[1] - distances[i]);
  }
  return result;
}

function clipHalfPlane(poly: Point[], normal: Point, offset: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = a[0] * normal[0] + a[1] * normal[1] - offset;
    const db = b[0] * normal[0] + b[1] * normal[1] - offset;
    if (da <= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

/** Align lots with the longest boundary, then cut along the longer dimension. */
function longestFrame(poly: Point[]): { axis: Point; min: number; max: number; across: number } {
  let axis: Point = [1, 0];
  let longest = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > longest) {
      longest = length;
      axis = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    }
  }
  const bounds = (n: Point) => {
    const values = poly.map(p => p[0] * n[0] + p[1] * n[1]);
    return [Math.min(...values), Math.max(...values)];
  };
  const [min, max] = bounds(axis);
  const normal: Point = [-axis[1], axis[0]];
  const [lo, hi] = bounds(normal);
  if (hi - lo > max - min) return { axis: normal, min: lo, max: hi, across: max - min };
  return { axis, min, max, across: hi - lo };
}
