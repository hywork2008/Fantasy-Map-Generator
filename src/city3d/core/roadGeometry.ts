// Extruded wearing-course ribbons for the CE 3D view.
// Plan positions go through planVertex. No three.js, and no city-editor import.

import type { RoadRibbon, RoadSurfaceId } from "../../utils/roadSurface";
import { ROAD_SURFACE_COLOR } from "../../utils/roadSurface";
import { planVertex } from "./planFrame";

/** Top of the wearing course, 5 cm above the land disc. */
export const ROAD_TOP_Y = -0.15;
/** Slab thickness. The underside is ROAD_TOP_Y minus this, still above the water. */
export const ROAD_THICKNESS_M = 0.03;

const MITER_WIDTHS = 4;
const TRIANGLE_LIMIT = 1e5;
const WET_EPSILON = 1e-6;

export interface RoadWaterCut {
  polygons: readonly (readonly (readonly [number, number])[])[];
  ribbons: readonly { points: readonly (readonly [number, number])[]; width: number }[];
}

export interface RoadTriangleSoup {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
}

export interface RoadSurfaceSoup {
  surface: RoadSurfaceId;
  soup: RoadTriangleSoup;
}

type Plan = readonly [number, number];
type Vec3 = [number, number, number];

interface Section {
  center: Plan;
  left: Plan;
  right: Plan;
}

/** One soup per surface that has triangles, at most seven. */
export function roadSurfaceSoups(ribbons: readonly RoadRibbon[], water: RoadWaterCut): RoadSurfaceSoup[] {
  const groups = new Map<RoadSurfaceId, RoadRibbon[]>();
  for (const ribbon of ribbons) {
    const list = groups.get(ribbon.surface);
    if (list) list.push(ribbon);
    else groups.set(ribbon.surface, [ribbon]);
  }
  const soups: RoadSurfaceSoup[] = [];
  for (const [surface, list] of groups) {
    let bucket = buildSurface(surface, list, water, 1);
    if (bucket.count > TRIANGLE_LIMIT) bucket = buildSurface(surface, list, water, 2);
    if (!bucket.positions.length) continue;
    soups.push({ surface, soup: bucket.soup() });
  }
  return soups;
}

/** Concatenated soups, for tests and callers that want one buffer. */
export function roadRibbonGeometry(ribbons: readonly RoadRibbon[], water: RoadWaterCut): RoadTriangleSoup {
  const parts = roadSurfaceSoups(ribbons, water);
  const counts = parts.reduce(
    (sum, part) => ({
      positions: sum.positions + part.soup.positions.length,
      normals: sum.normals + part.soup.normals.length,
      colors: sum.colors + part.soup.colors.length
    }),
    { positions: 0, normals: 0, colors: 0 }
  );
  const positions = new Float32Array(counts.positions);
  const normals = new Float32Array(counts.normals);
  const colors = new Float32Array(counts.colors);
  let position = 0;
  let normal = 0;
  let color = 0;
  for (const part of parts) {
    positions.set(part.soup.positions, position);
    normals.set(part.soup.normals, normal);
    colors.set(part.soup.colors, color);
    position += part.soup.positions.length;
    normal += part.soup.normals.length;
    color += part.soup.colors.length;
  }
  return { positions, normals, colors };
}

class Bucket {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];

  get count(): number {
    return this.positions.length / 9;
  }

  soup(): RoadTriangleSoup {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors)
    };
  }
}

function buildSurface(
  surface: RoadSurfaceId,
  ribbons: readonly RoadRibbon[],
  water: RoadWaterCut,
  scale: number
): Bucket {
  const bucket = new Bucket();
  const step = stepMeters(surface) * scale;
  for (const ribbon of ribbons) appendRibbon(bucket, ribbon, water, step);
  return bucket;
}

function appendRibbon(bucket: Bucket, ribbon: RoadRibbon, water: RoadWaterCut, step: number): void {
  if (!(ribbon.widthMeters > 0) || !Number.isFinite(ribbon.widthMeters) || ribbon.centerline.length < 2) return;
  const strips = stripCount(ribbon.surface, ribbon.widthMeters);
  const sections = sectionsOf(ribbon.centerline, ribbon.widthMeters, step);
  if (sections.length < 2) return;
  const paint = painter(ribbon.surface);
  const bottom = ROAD_TOP_Y - ROAD_THICKNESS_M;
  for (let i = 0; i + 1 < sections.length; i++) {
    const a = across(sections[i], strips);
    const b = across(sections[i + 1], strips);
    for (let s = 0; s < strips; s++) {
      const span = paint(i, s);
      if (ribbon.surface === "setts" || ribbon.surface === "flags") {
        const center = meanPlan([a[s], a[s + 1], b[s + 1], b[s]]);
        const joint = rgb(ROAD_SURFACE_COLOR[ribbon.surface].joint ?? ROAD_SURFACE_COLOR[ribbon.surface].base);
        const field = rgb(ROAD_SURFACE_COLOR[ribbon.surface].base);
        const corners = [a[s], a[s + 1], b[s + 1], b[s]];
        for (let c = 0; c < 4; c++)
          addTop(bucket, center, corners[c], corners[(c + 1) % 4], field, joint, joint, water);
      } else {
        addTop(bucket, a[s], a[s + 1], b[s + 1], span, span, span, water);
        addTop(bucket, a[s], b[s + 1], b[s], span, span, span, water);
      }
    }
    const side = rgb(ROAD_SURFACE_COLOR[ribbon.surface].base);
    addWall(bucket, sections[i], sections[i + 1], a[0], b[0], true, bottom, side, water);
    addWall(bucket, sections[i], sections[i + 1], a[strips], b[strips], false, bottom, side, water);
  }
  const cap = rgb(ROAD_SURFACE_COLOR[ribbon.surface].base);
  addCap(bucket, sections[0], sections[1], strips, true, bottom, cap, water);
  addCap(bucket, sections[sections.length - 1], sections[sections.length - 2], strips, false, bottom, cap, water);
}

function addTop(bucket: Bucket, a: Plan, b: Plan, c: Plan, ca: Vec3, cb: Vec3, cc: Vec3, water: RoadWaterCut): void {
  addTriangle(bucket, at(a, ROAD_TOP_Y), at(b, ROAD_TOP_Y), at(c, ROAD_TOP_Y), ca, cb, cc, [0, 1, 0], water);
}

function addWall(
  bucket: Bucket,
  from: Section,
  to: Section,
  a: Plan,
  b: Plan,
  left: boolean,
  bottom: number,
  color: Vec3,
  water: RoadWaterCut
): void {
  const mid = lerp(from.center, to.center, 0.5);
  const edge = lerp(a, b, 0.5);
  const outward = unit(edge[0] - mid[0], edge[1] - mid[1]) ?? (left ? [0, 1] : [0, -1]);
  const normal: Vec3 = [outward[0], 0, -outward[1]];
  addTriangle(bucket, at(a, ROAD_TOP_Y), at(b, ROAD_TOP_Y), at(a, bottom), color, color, color, normal, water);
  addTriangle(bucket, at(b, ROAD_TOP_Y), at(b, bottom), at(a, bottom), color, color, color, normal, water);
}

function addCap(
  bucket: Bucket,
  end: Section,
  inner: Section,
  strips: number,
  start: boolean,
  bottom: number,
  color: Vec3,
  water: RoadWaterCut
): void {
  const outward = unit(end.center[0] - inner.center[0], end.center[1] - inner.center[1]) ?? [start ? -1 : 1, 0];
  const normal: Vec3 = [outward[0], 0, -outward[1]];
  const row = across(end, strips);
  for (let s = 0; s < strips; s++) {
    addTriangle(
      bucket,
      at(row[s], ROAD_TOP_Y),
      at(row[s + 1], ROAD_TOP_Y),
      at(row[s], bottom),
      color,
      color,
      color,
      normal,
      water
    );
    addTriangle(
      bucket,
      at(row[s + 1], ROAD_TOP_Y),
      at(row[s + 1], bottom),
      at(row[s], bottom),
      color,
      color,
      color,
      normal,
      water
    );
  }
}

function addTriangle(
  bucket: Bucket,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  ca: Vec3,
  cb: Vec3,
  cc: Vec3,
  outward: Vec3,
  water: RoadWaterCut
): void {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let normal = cross(ab, ac);
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  if (length < 1e-10) return;
  let vb = b;
  let cbv = cb;
  let vc = c;
  let ccv = cc;
  if (dot(normal, outward) < 0) {
    vb = c;
    cbv = cc;
    vc = b;
    ccv = cb;
    normal = [-normal[0], -normal[1], -normal[2]];
  }
  if (wetTriangle(a, vb, vc, water)) return;
  const scale = 1 / length;
  const n: Vec3 = [normal[0] * scale, normal[1] * scale, normal[2] * scale];
  pushVertex(bucket, a, n, ca);
  pushVertex(bucket, vb, n, cbv);
  pushVertex(bucket, vc, n, ccv);
}

function pushVertex(bucket: Bucket, position: Vec3, normal: Vec3, color: Vec3): void {
  bucket.positions.push(position[0], position[1], position[2]);
  bucket.normals.push(normal[0], normal[1], normal[2]);
  bucket.colors.push(color[0], color[1], color[2]);
}

function wetTriangle(a: Vec3, b: Vec3, c: Vec3, water: RoadWaterCut): boolean {
  if (!water.polygons.length && !water.ribbons.length) return false;
  const plans = uniquePlans([planOf(a), planOf(b), planOf(c)]);
  const edges = plans.length >= 2 ? planEdges(plans) : [];
  for (const polygon of water.polygons) {
    const ring = opened(polygon);
    if (ring.length < 3) continue;
    if (plans.some(point => strictlyInside(point, ring))) return true;
    if (edges.some(([p, q]) => ring.some((start, index) => properCross(p, q, start, ring[(index + 1) % ring.length]))))
      return true;
  }
  for (const ribbon of water.ribbons) {
    if (ribbon.points.length < 2 || !(ribbon.width > 0)) continue;
    const limit = ribbon.width / 2 - WET_EPSILON;
    if (limit <= 0) continue;
    if (plans.some(point => distanceToPolyline(point, ribbon.points) < limit)) return true;
    if (edges.some(([p, q]) => segmentToPolyline(p, q, ribbon.points) < limit)) return true;
  }
  return false;
}

function strictlyInside(point: Plan, ring: readonly Plan[]): boolean {
  return pointInRing(point, ring) && distanceToRing(point, ring) > WET_EPSILON;
}

function pointInRing(point: Plan, ring: readonly Plan[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1];
    const yj = ring[j][1];
    if (yi > point[1] === yj > point[1]) continue;
    const x = ((ring[j][0] - ring[i][0]) * (point[1] - yi)) / (yj - yi) + ring[i][0];
    if (point[0] < x) inside = !inside;
  }
  return inside;
}

function properCross(a: Plan, b: Plan, c: Plan, d: Plan): boolean {
  const side = (p: Plan, q: Plan, r: Plan) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  if (Math.abs(d1) <= 1e-8 || Math.abs(d2) <= 1e-8 || Math.abs(d3) <= 1e-8 || Math.abs(d4) <= 1e-8) return false;
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function sectionsOf(line: readonly Plan[], width: number, step: number): Section[] {
  const clean: Plan[] = [];
  for (const point of line) {
    const last = clean[clean.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 1e-4) clean.push(point);
  }
  if (clean.length < 2) return [];
  const corners = cornerOffsets(clean, width);
  const sections: Section[] = [];
  for (let i = 0; i + 1 < clean.length; i++) {
    const a = clean[i];
    const b = clean[i + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) continue;
    const marks = [0];
    for (let distance = step; distance < length - 1e-4; distance += step) marks.push(distance / length);
    marks.push(1);
    for (let k = 0; k < marks.length; k++) {
      if (sections.length && k === 0) continue;
      const t = marks[k];
      sections.push({
        center: lerp(a, b, t),
        left: lerp(corners[i].left, corners[i + 1].left, t),
        right: lerp(corners[i].right, corners[i + 1].right, t)
      });
    }
  }
  return sections;
}

/** Offset a bend. The outside of the miter stops at 4 times the full width. */
function cornerOffsets(line: readonly Plan[], width: number): { left: Plan; right: Plan }[] {
  const half = width / 2;
  const limit = MITER_WIDTHS * width;
  const tangents: Plan[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const dx = line[i + 1][0] - line[i][0];
    const dy = line[i + 1][1] - line[i][1];
    tangents.push(unit(dx, dy) ?? [1, 0]);
  }
  return line.map((point, index) => {
    const incoming = tangents[Math.max(0, index - 1)];
    const outgoing = tangents[Math.min(tangents.length - 1, index)];
    const leftIn = leftNormal(incoming);
    const leftOut = leftNormal(outgoing);
    return {
      left: miter(point, leftIn, leftOut, half, limit),
      right: miter(point, [-leftIn[0], -leftIn[1]], [-leftOut[0], -leftOut[1]], half, limit)
    };
  });
}

function miter(origin: Plan, n0: Plan, n1: Plan, half: number, limit: number): Plan {
  const sx = n0[0] + n1[0];
  const sy = n0[1] + n1[1];
  const length = Math.hypot(sx, sy);
  if (length < 1e-6) return [origin[0] + n0[0] * half, origin[1] + n0[1] * half];
  const ux = sx / length;
  const uy = sy / length;
  const alignment = Math.max(ux * n0[0] + uy * n0[1], 1e-3);
  const scale = Math.min(half / alignment, limit);
  return [origin[0] + ux * scale, origin[1] + uy * scale];
}

function leftNormal(tangent: Plan): Plan {
  return [-tangent[1], tangent[0]];
}

function across(section: Section, strips: number): Plan[] {
  const points: Plan[] = [];
  for (let i = 0; i <= strips; i++) points.push(lerp(section.left, section.right, i / strips));
  return points;
}

function painter(surface: RoadSurfaceId): (row: number, column: number) => Vec3 {
  const color = ROAD_SURFACE_COLOR[surface];
  if (surface === "corduroy") {
    const pair = color.close ?? [color.base, color.base];
    return row => rgb(pair[row & 1]);
  }
  if (surface === "gravel") {
    const pair = color.close ?? [color.base, color.base];
    return (row, column) => rgb(pair[(row + column) & 1]);
  }
  const solid = rgb(color.base);
  return () => solid;
}

function stepMeters(surface: RoadSurfaceId): number {
  if (surface === "gravel") return 1.2;
  if (surface === "setts") return 0.45;
  if (surface === "flags") return 1.4;
  if (surface === "corduroy") return 0.3;
  return 4;
}

function stripCount(surface: RoadSurfaceId, width: number): number {
  if (surface === "flags") return Math.max(2, Math.round(width / 0.9));
  if (surface === "gravel" || surface === "setts") return 4;
  return 1;
}

function at(point: Plan, y: number): Vec3 {
  return planVertex([point[0], point[1]], y);
}

function planOf(point: Vec3): Plan {
  return [point[0], -point[2]];
}

function rgb(hex: number): Vec3 {
  return [(hex >> 16) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function lerp(a: Plan, b: Plan, t: number): Plan {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function meanPlan(points: readonly Plan[]): Plan {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}

function unit(x: number, y: number): Plan | null {
  const length = Math.hypot(x, y);
  if (length < 1e-8) return null;
  return [x / length, y / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function opened(ring: readonly Plan[]): Plan[] {
  if (
    ring.length >= 2 &&
    Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1e-6
  )
    return ring.slice(0, -1);
  return [...ring];
}

function uniquePlans(points: Plan[]): Plan[] {
  const unique: Plan[] = [];
  for (const point of points)
    if (!unique.some(other => Math.hypot(other[0] - point[0], other[1] - point[1]) <= 1e-6)) unique.push(point);
  return unique;
}

function planEdges(points: Plan[]): [Plan, Plan][] {
  const edges: [Plan, Plan][] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) edges.push([a, b]);
  }
  return edges;
}

function distanceToRing(point: Plan, ring: readonly Plan[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length; i++)
    best = Math.min(best, distanceToSegment(point, ring[i], ring[(i + 1) % ring.length]));
  return best;
}

function distanceToPolyline(point: Plan, line: readonly Plan[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, distanceToSegment(point, line[i], line[i + 1]));
  return best;
}

function segmentToPolyline(a: Plan, b: Plan, line: readonly Plan[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, distanceSegmentSegment(a, b, line[i], line[i + 1]));
  return best;
}

function distanceSegmentSegment(a: Plan, b: Plan, c: Plan, d: Plan): number {
  if (properCross(a, b, c, d)) return 0;
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b)
  );
}

function distanceToSegment(point: Plan, a: Plan, b: Plan): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (length2 < 1e-12) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}
