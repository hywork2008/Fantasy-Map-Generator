// Flat water tops and bank skirts for the CE 3D view.
// Plan positions go through planVertex. No three.js import, and no town generator import.

import type { Point } from "../../city-editor/types/primitives";
import type { TriangleSoup } from "./massingGeometry";
import { planVertex } from "./planFrame";

/** Land height. Matches the CE ground disc. */
export const LAND_Y = -0.2;
/** Water surface, 0.35 m below the land. No thickness and no bottom cap. */
export const WATER_Y = -0.55;
/** Distance from a bank edge to the wet probe, in metres. */
export const BANK_TEST_METERS = 0.25;

const MIN_TRI_AREA = 1e-4;
const MIN_EDGE = 1e-8;
const SHARED_EDGE = 1e-6;

export interface WaterSurfaces {
  top: TriangleSoup;
  skirt: TriangleSoup;
}

interface Bucket {
  positions: number[];
  normals: number[];
}

type V3 = [number, number, number];

/**
 * Place 3-point rings on the water plane and raise a skirt on boundary edges
 * that separate wet from dry. Unsplit rings are ignored. Shared edges and
 * edges that are wet or dry on both sides get no skirt.
 */
export function waterSurfaceGeometry(
  triangles: readonly Point[][],
  boundaries: readonly Point[][],
  isWet: (point: Point) => boolean
): WaterSurfaces {
  const top: Bucket = { positions: [], normals: [] };
  const skirt: Bucket = { positions: [], normals: [] };
  for (const triangle of triangles) addTop(top, triangle);
  const rings = boundaries.map(openRing);
  for (let index = 0; index < rings.length; index++) addSkirts(skirt, rings[index], index, rings, isWet);
  return { top: toSoup(top), skirt: toSoup(skirt) };
}

function addTop(bucket: Bucket, triangle: readonly Point[]): void {
  if (triangle.length !== 3) return;
  const [a, b, c] = triangle;
  if (!finite(a) || !finite(b) || !finite(c)) return;
  if (span(a, b) < MIN_EDGE || span(b, c) < MIN_EDGE || span(c, a) < MIN_EDGE) return;
  const av = planVertex(a, WATER_Y);
  const bv = planVertex(b, WATER_Y);
  const cv = planVertex(c, WATER_Y);
  const ny = (bv[2] - av[2]) * (cv[0] - av[0]) - (bv[0] - av[0]) * (cv[2] - av[2]);
  if (Math.abs(ny) * 0.5 < MIN_TRI_AREA) return;
  const ordered = ny < 0 ? [cv, bv, av] : [av, bv, cv];
  for (const vertex of ordered) {
    bucket.positions.push(vertex[0], vertex[1], vertex[2]);
    bucket.normals.push(0, 1, 0);
  }
}

function addSkirts(
  bucket: Bucket,
  ring: readonly Point[],
  index: number,
  rings: readonly (readonly Point[])[],
  isWet: (point: Point) => boolean
): void {
  if (ring.length < 3) return;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < MIN_EDGE) continue;
    const mid: Point = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
    if (rings.some((other, otherIndex) => otherIndex !== index && ringDistance(mid, other) <= SHARED_EDGE)) continue;
    const left: Point = [-dy / length, dx / length];
    const wetLeft = isWet([mid[0] + left[0] * BANK_TEST_METERS, mid[1] + left[1] * BANK_TEST_METERS]);
    const wetRight = isWet([mid[0] - left[0] * BANK_TEST_METERS, mid[1] - left[1] * BANK_TEST_METERS]);
    if (wetLeft === wetRight) continue;
    const dry: Point = wetLeft ? [-left[0], -left[1]] : left;
    const bottomA = planVertex(a, WATER_Y);
    const bottomB = planVertex(b, WATER_Y);
    const topA = planVertex(a, LAND_Y);
    const topB = planVertex(b, LAND_Y);
    // Winding matches planVertex, so the geometric normal points at the dry side.
    const faces = wetLeft
      ? [
          [bottomA, bottomB, topA],
          [bottomB, topB, topA]
        ]
      : [
          [bottomA, topA, bottomB],
          [bottomB, topA, topB]
        ];
    const normal = planVertex(dry, 0);
    for (const face of faces) for (const vertex of face) push(bucket, vertex, normal);
  }
}

function openRing(ring: readonly Point[]): Point[] {
  const points = ring.filter(finite);
  if (points.length > 1 && span(points[0], points[points.length - 1]) < MIN_EDGE) points.pop();
  return points;
}

function ringDistance(point: Point, ring: readonly Point[]): number {
  let best = Infinity;
  if (!ring.length) return best;
  for (let i = 0; i < ring.length; i++)
    best = Math.min(best, segmentDistance(point, ring[i], ring[(i + 1) % ring.length]));
  return best;
}

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (length2 < MIN_EDGE * MIN_EDGE) return span(point, a);
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}

function span(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function finite(point: Point): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function push(bucket: Bucket, vertex: V3, normal: V3): void {
  bucket.positions.push(vertex[0], vertex[1], vertex[2]);
  bucket.normals.push(normal[0], normal[1], normal[2]);
}

function toSoup(bucket: Bucket): TriangleSoup {
  return { positions: Float32Array.from(bucket.positions), normals: Float32Array.from(bucket.normals) };
}
