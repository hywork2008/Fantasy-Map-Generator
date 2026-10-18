// Flat water tops and bank skirts for the CE 3D view.
// Plan positions go through planVertex. No three.js import, and no town generator import.

import type { Point } from "../../city-editor/types/primitives";
import type { TriangleSoup } from "./massingGeometry";
import { planVertex } from "./planFrame";

/** Land height. Matches the CE ground disc. */
export const LAND_Y = -0.2;
/** Inland water surface, 1 m below the flattened land. No bottom cap. */
export const WATER_Y = LAND_Y - 1;
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
 * that separate wet from dry. Unsplit rings are ignored. Boundary edges are
 * split at water junctions so partially shared shores leave river mouths open.
 * Edges that are wet or dry on both sides get no skirt.
 */
export function waterSurfaceGeometry(
  triangles: readonly Point[][],
  boundaries: readonly Point[][],
  isWet: (point: Point) => boolean,
  levels: { waterY?: number; boundaryWaterY?: readonly number[] } = {}
): WaterSurfaces {
  const top: Bucket = { positions: [], normals: [] };
  const skirt: Bucket = { positions: [], normals: [] };
  const waterY = levels.waterY ?? WATER_Y;
  for (const triangle of triangles) addTop(top, triangle, waterY);
  const rings = boundaries.map(openRing);
  for (let index = 0; index < rings.length; index++)
    addSkirts(skirt, rings[index], index, rings, isWet, levels.boundaryWaterY?.[index] ?? waterY);
  return { top: toSoup(top), skirt: toSoup(skirt) };
}

function addTop(bucket: Bucket, triangle: readonly Point[], waterY: number): void {
  if (triangle.length !== 3) return;
  const [a, b, c] = triangle;
  if (!finite(a) || !finite(b) || !finite(c)) return;
  if (span(a, b) < MIN_EDGE || span(b, c) < MIN_EDGE || span(c, a) < MIN_EDGE) return;
  const av = planVertex(a, waterY);
  const bv = planVertex(b, waterY);
  const cv = planVertex(c, waterY);
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
  isWet: (point: Point) => boolean,
  waterY: number
): void {
  if (ring.length < 3) return;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const cuts = bankEdgeCuts(a, b, index, rings);
    for (let j = 1; j < cuts.length; j++) {
      const start: Point = [a[0] + (b[0] - a[0]) * cuts[j - 1], a[1] + (b[1] - a[1]) * cuts[j - 1]];
      const end: Point = [a[0] + (b[0] - a[0]) * cuts[j], a[1] + (b[1] - a[1]) * cuts[j]];
      addBankEdge(bucket, start, end, isWet, waterY);
    }
  }
}

function addBankEdge(bucket: Bucket, a: Point, b: Point, isWet: (point: Point) => boolean, waterY: number): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < MIN_EDGE) return;
  const mid: Point = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
  const left: Point = [-dy / length, dx / length];
  const wetLeft = isWet([mid[0] + left[0] * BANK_TEST_METERS, mid[1] + left[1] * BANK_TEST_METERS]);
  const wetRight = isWet([mid[0] - left[0] * BANK_TEST_METERS, mid[1] - left[1] * BANK_TEST_METERS]);
  if (wetLeft === wetRight) return;
  const dry: Point = wetLeft ? [-left[0], -left[1]] : left;
  const bottomA = planVertex(a, waterY);
  const bottomB = planVertex(b, waterY);
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

/** Include intersections and collinear endpoints, including T-junctions. */
function bankEdgeCuts(a: Point, b: Point, index: number, rings: readonly (readonly Point[])[]): number[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < MIN_EDGE) return [0, 1];
  const cuts = [0, 1];
  const epsilon = SHARED_EDGE / length;
  const add = (t: number) => {
    if (t > epsilon && t < 1 - epsilon) cuts.push(t);
  };
  for (let r = 0; r < rings.length; r++) {
    if (r === index) continue;
    const ring = rings[r];
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i];
      const d = ring[(i + 1) % ring.length];
      if (
        Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - SHARED_EDGE ||
        Math.min(c[0], d[0]) > Math.max(a[0], b[0]) + SHARED_EDGE ||
        Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - SHARED_EDGE ||
        Math.min(c[1], d[1]) > Math.max(a[1], b[1]) + SHARED_EDGE
      )
        continue;
      const ex = d[0] - c[0];
      const ey = d[1] - c[1];
      const otherLength = Math.hypot(ex, ey);
      if (otherLength < MIN_EDGE) continue;
      const cx = c[0] - a[0];
      const cy = c[1] - a[1];
      const cross = dx * ey - dy * ex;
      if (Math.abs(cross) > 1e-10 * length * otherLength) {
        const t = (cx * ey - cy * ex) / cross;
        const u = (cx * dy - cy * dx) / cross;
        if (u >= -SHARED_EDGE / otherLength && u <= 1 + SHARED_EDGE / otherLength) add(t);
      } else if (Math.abs(cx * dy - cy * dx) <= SHARED_EDGE * length) {
        add((cx * dx + cy * dy) / (length * length));
        add(((d[0] - a[0]) * dx + (d[1] - a[1]) * dy) / (length * length));
      }
    }
  }
  return cuts.sort((x, y) => x - y).filter((t, i, sorted) => i === 0 || t - sorted[i - 1] > epsilon);
}

function openRing(ring: readonly Point[]): Point[] {
  const points = ring.filter(finite);
  if (points.length > 1 && span(points[0], points[points.length - 1]) < MIN_EDGE) points.pop();
  return points;
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
