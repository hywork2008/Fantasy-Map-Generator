import type { BuildingMassing, RoofForm } from "../../city-editor/types/contracts/buildingMassing";
import type { Point } from "../../city-editor/types/primitives";
import { planVertex } from "./planFrame";

type V3 = [number, number, number];
interface Bucket {
  positions: number[];
  normals: number[];
}

export interface TriangleSoup {
  positions: Float32Array;
  normals: Float32Array;
}

export interface BuildingSurfaces {
  walls: TriangleSoup;
  roofs: TriangleSoup;
}

const JETTY_CAP_METERS = 1.2;

function toSoup(bucket: Bucket): TriangleSoup {
  return { positions: Float32Array.from(bucket.positions), normals: Float32Array.from(bucket.normals) };
}

function cleanRing(poly: readonly Point[]): Point[] {
  const ring: Point[] = [];
  for (const point of poly) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    const previous = ring[ring.length - 1];
    if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 1e-6) continue;
    ring.push([point[0], point[1]]);
  }
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) ring.pop();
  }
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  if (area < 0) ring.reverse();
  return ring.length >= 3 && Math.abs(area) > 1 ? ring : [];
}

function isConvex(poly: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = poly[(i + 2) % poly.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-6) continue;
    const next = Math.sign(cross);
    if (sign && next !== sign) return false;
    sign = next;
  }
  return true;
}

function centroid(poly: readonly Point[]): Point {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    area += cross;
    x += (poly[j][0] + poly[i][0]) * cross;
    y += (poly[j][1] + poly[i][1]) * cross;
  }
  if (Math.abs(area) < 1e-8) {
    const mean = poly.reduce<Point>((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
    return [mean[0] / poly.length, mean[1] / poly.length];
  }
  return [x / (3 * area), y / (3 * area)];
}

function lineIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  return [a[0] + t * rx, a[1] + t * ry];
}

/** Outward offset of a CCW convex ring. Returns the input when the offset is not usable. */
function offsetConvex(poly: readonly Point[], distance: number): Point[] {
  if (distance <= 1e-6) return poly.map(point => [point[0], point[1]]);
  const lines = poly.map((point, index) => {
    const next = poly[(index + 1) % poly.length];
    const dx = next[0] - point[0];
    const dy = next[1] - point[1];
    const length = Math.hypot(dx, dy) || 1;
    const ox = (dy / length) * distance;
    const oy = (-dx / length) * distance;
    return {
      a: [point[0] + ox, point[1] + oy] as Point,
      b: [next[0] + ox, next[1] + oy] as Point
    };
  });
  const ring: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const previous = lines[(i + poly.length - 1) % poly.length];
    const hit = lineIntersection(previous.a, previous.b, lines[i].a, lines[i].b);
    if (!hit || !Number.isFinite(hit[0]) || !Number.isFinite(hit[1])) return poly.map(point => [point[0], point[1]]);
    // Acute corners must not turn a small jetty into a long projecting spike.
    if (Math.hypot(hit[0] - poly[i][0], hit[1] - poly[i][1]) > distance * 4)
      return poly.map(point => [point[0], point[1]]);
    ring.push(hit);
  }
  return ring;
}

function cross2(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTri(p: Point, a: Point, b: Point, c: Point): boolean {
  const c1 = cross2(a, b, p);
  const c2 = cross2(b, c, p);
  const c3 = cross2(c, a, p);
  const negative = c1 < -1e-8 || c2 < -1e-8 || c3 < -1e-8;
  const positive = c1 > 1e-8 || c2 > 1e-8 || c3 > 1e-8;
  return !(negative && positive);
}

export function earClip(poly: readonly Point[]): Array<[number, number, number]> {
  const index = poly.map((_, i) => i);
  const triangles: Array<[number, number, number]> = [];
  let guard = poly.length * poly.length;
  while (index.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < index.length; i++) {
      const a = index[(i + index.length - 1) % index.length];
      const b = index[i];
      const c = index[(i + 1) % index.length];
      if (cross2(poly[a], poly[b], poly[c]) <= 1e-8) continue;
      let contains = false;
      for (const other of index) {
        if (other === a || other === b || other === c) continue;
        if (pointInTri(poly[other], poly[a], poly[b], poly[c])) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      triangles.push([a, b, c]);
      index.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (index.length === 3) triangles.push([index[0], index[1], index[2]]);
  return triangles;
}

function pushOriented(bucket: Bucket, a: V3, b: V3, c: V3, interior: V3, forceDown = false): void {
  let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const length = Math.hypot(nx, ny, nz);
  if (length < 1e-8) return;
  nx /= length;
  ny /= length;
  nz /= length;
  const mx = (a[0] + b[0] + c[0]) / 3;
  const my = (a[1] + b[1] + c[1]) / 3;
  const mz = (a[2] + b[2] + c[2]) / 3;
  const facesIn = forceDown ? ny > 0 : nx * (interior[0] - mx) + ny * (interior[1] - my) + nz * (interior[2] - mz) > 0;
  if (facesIn) {
    [b, c] = [c, b];
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  bucket.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  bucket.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
}

function addWall(bucket: Bucket, a: Point, b: Point, y0: number, y1: number, interior: V3): void {
  const a0 = planVertex(a, y0);
  const b0 = planVertex(b, y0);
  const a1 = planVertex(a, y1);
  const b1 = planVertex(b, y1);
  pushOriented(bucket, a0, b0, b1, interior);
  pushOriented(bucket, a0, b1, a1, interior);
}

function addSoffit(bucket: Bucket, inner: readonly Point[], outer: readonly Point[], y: number): void {
  if (inner.length !== outer.length) return;
  for (let i = 0; i < inner.length; i++) {
    const next = (i + 1) % inner.length;
    const a = planVertex(inner[i], y);
    const b = planVertex(inner[next], y);
    const c = planVertex(outer[next], y);
    const d = planVertex(outer[i], y);
    pushOriented(bucket, a, b, c, [0, y + 1, 0], true);
    pushOriented(bucket, a, c, d, [0, y + 1, 0], true);
  }
}

function addFloor(bucket: Bucket, ring: readonly Point[], interior: V3): void {
  for (const [i, j, k] of earClip(ring)) {
    pushOriented(bucket, planVertex(ring[i], 0), planVertex(ring[j], 0), planVertex(ring[k], 0), interior);
  }
}

function addFlatRoof(bucket: Bucket, ring: readonly Point[], y: number, interior: V3): void {
  for (const [i, j, k] of earClip(ring)) {
    pushOriented(bucket, planVertex(ring[i], y), planVertex(ring[j], y), planVertex(ring[k], y), interior);
  }
}

function dot2(point: Point, axis: readonly [number, number]): number {
  return point[0] * axis[0] + point[1] * axis[1];
}

function projectToRidge(point: Point, start: Point, end: Point): Point {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length2 = dx * dx + dy * dy;
  if (length2 < 1e-12) return start;
  const t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2;
  if (t <= 0) return start;
  if (t >= 1) return end;
  return [start[0] + t * dx, start[1] + t * dy];
}

function samePoint(a: Point, b: Point): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4;
}

/** Intersections of the centre line `v = vMid` with a convex ring, ordered along the ridge. */
function ridgeEnds(ring: readonly Point[], azimuth: number): { start: Point; end: Point; run: number } | null {
  const along: [number, number] = [Math.cos(azimuth), Math.sin(azimuth)];
  const across: [number, number] = [-along[1], along[0]];
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const point of ring) {
    const acrossValue = dot2(point, across);
    vMin = Math.min(vMin, acrossValue);
    vMax = Math.max(vMax, acrossValue);
  }
  const vMid = (vMin + vMax) / 2;
  const hits: { along: number; point: Point }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const va = dot2(a, across) - vMid;
    const vb = dot2(b, across) - vMid;
    if (Math.abs(va) < 1e-8 && Math.abs(vb) < 1e-8) {
      hits.push({ along: dot2(a, along), point: a }, { along: dot2(b, along), point: b });
      continue;
    }
    if (va * vb > 0) continue;
    const t = Math.abs(va - vb) < 1e-12 ? 0 : va / (va - vb);
    const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    hits.push({ along: dot2(point, along), point });
  }
  hits.sort((a, b) => a.along - b.along);
  const unique: typeof hits = [];
  for (const hit of hits) {
    if (unique.some(kept => samePoint(kept.point, hit.point))) continue;
    unique.push(hit);
  }
  if (unique.length < 2) return null;
  const run = (vMax - vMin) / 2;
  if (run < 1e-3) return null;
  return { start: unique[0].point, end: unique[unique.length - 1].point, run };
}

function normalY(a: V3, b: V3, c: V3): number {
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const length = Math.hypot(nx, ny, nz);
  return length < 1e-8 ? 0 : ny / length;
}

/** A gable end is vertical. A sloped face, including a pyramid face that meets at one apex, is a roof. */
function addClassified(walls: Bucket, roofs: Bucket, a: V3, b: V3, c: V3, interior: V3): void {
  const bucket = Math.abs(normalY(a, b, c)) > 0.35 ? roofs : walls;
  pushOriented(bucket, a, b, c, interior);
}

function addEdgeToRidge(
  walls: Bucket,
  roofs: Bucket,
  a: Point,
  b: Point,
  ridgeStart: Point,
  ridgeEnd: Point,
  y: number,
  rise: number,
  interior: V3
): void {
  const projectedA = projectToRidge(a, ridgeStart, ridgeEnd);
  const projectedB = projectToRidge(b, ridgeStart, ridgeEnd);
  if (samePoint(a, projectedA) && samePoint(b, projectedB)) {
    addWall(walls, a, b, y, y + rise, interior);
    return;
  }
  const a0 = planVertex(a, y);
  const b0 = planVertex(b, y);
  const a1 = planVertex(projectedA, y + rise);
  const b1 = planVertex(projectedB, y + rise);
  if (samePoint(projectedA, projectedB)) {
    addClassified(walls, roofs, a0, b0, a1, interior);
    return;
  }
  addClassified(walls, roofs, a0, b0, b1, interior);
  addClassified(walls, roofs, a0, b1, a1, interior);
}

function addPitchedRoof(
  walls: Bucket,
  roofs: Bucket,
  ring: readonly Point[],
  y: number,
  form: RoofForm,
  azimuth: number,
  pitchDeg: number,
  interior: V3,
  maximumRoofRiseMeters: number
): void {
  if (form === "lean-to") {
    addLeanTo(walls, roofs, ring, y, pitchDeg, interior);
    return;
  }
  const ends = ridgeEnds(ring, azimuth);
  if (!ends) {
    addFlatRoof(roofs, ring, y, interior);
    return;
  }
  if (ring.length === 4) {
    addQuadrilateralRoof(walls, roofs, ring, y, form, azimuth, pitchDeg, ends.run, interior, maximumRoofRiseMeters);
    return;
  }
  const span = Math.hypot(ends.end[0] - ends.start[0], ends.end[1] - ends.start[1]);
  const hip = form === "hip" || form === "pyramid";
  const inset = hip ? Math.min(ends.run, span / 2) : 0;
  const rise = (hip ? inset : ends.run) * Math.tan((pitchDeg * Math.PI) / 180);
  const scale = span < 1e-6 ? 0 : inset / span;
  const dx = ends.end[0] - ends.start[0];
  const dy = ends.end[1] - ends.start[1];
  const ridgeStart: Point = [ends.start[0] + dx * scale, ends.start[1] + dy * scale];
  const ridgeEnd: Point = [ends.end[0] - dx * scale, ends.end[1] - dy * scale];
  for (let i = 0; i < ring.length; i++)
    addEdgeToRidge(walls, roofs, ring[i], ring[(i + 1) % ring.length], ridgeStart, ridgeEnd, y, rise, interior);
}

/** A skewed house still has two complete roof slopes and two end faces.
 * Projecting each corner independently onto the ridge creates unmatched ridge
 * subdivisions on trapezoids. Shared endpoints keep both slopes watertight. */
function addQuadrilateralRoof(
  walls: Bucket,
  roofs: Bucket,
  ring: readonly Point[],
  y: number,
  form: RoofForm,
  azimuth: number,
  pitchDeg: number,
  run: number,
  interior: V3,
  maximumRoofRiseMeters: number
): void {
  const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const along: Point = [Math.cos(azimuth), Math.sin(azimuth)];
  const alignment = (i: number): number => {
    const a = midpoint(ring[i], ring[i + 1]);
    const b = midpoint(ring[i + 2], ring[(i + 3) % 4]);
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    return Math.abs(dx * along[0] + dy * along[1]) / Math.hypot(dx, dy);
  };
  const i = alignment(0) >= alignment(1) ? 0 : 1;
  const a = ring[i],
    b = ring[i + 1],
    c = ring[i + 2],
    d = ring[(i + 3) % 4];
  const start = midpoint(a, b),
    end = midpoint(c, d);
  const span = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const hip = form === "hip" || form === "pyramid";
  const inset = hip ? Math.min(run, span / 2) : 0;
  const rise = Math.min(maximumRoofRiseMeters, (hip ? inset : run) * Math.tan((pitchDeg * Math.PI) / 180));
  const t = span > 1e-6 ? inset / span : 0;
  const r0 = planVertex([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t], y + rise);
  const r1 = planVertex([end[0] + (start[0] - end[0]) * t, end[1] + (start[1] - end[1]) * t], y + rise);
  const a0 = planVertex(a, y),
    b0 = planVertex(b, y),
    c0 = planVertex(c, y),
    d0 = planVertex(d, y);
  pushOriented(hip ? roofs : walls, a0, b0, r0, interior);
  pushOriented(roofs, b0, c0, r1, interior);
  pushOriented(roofs, b0, r1, r0, interior);
  pushOriented(hip ? roofs : walls, c0, d0, r1, interior);
  pushOriented(roofs, d0, a0, r0, interior);
  pushOriented(roofs, d0, r0, r1, interior);
}

function addLeanTo(
  walls: Bucket,
  roofs: Bucket,
  ring: readonly Point[],
  y: number,
  pitchDeg: number,
  interior: V3
): void {
  let longest = 0;
  let index = 0;
  for (let i = 0; i < ring.length; i++) {
    const length = Math.hypot(ring[(i + 1) % ring.length][0] - ring[i][0], ring[(i + 1) % ring.length][1] - ring[i][1]);
    if (length > longest) {
      longest = length;
      index = i;
    }
  }
  const start = ring[index];
  const end = ring[(index + 1) % ring.length];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || 1;
  let run = 0;
  for (const point of ring) {
    const distance = Math.abs((point[0] - start[0]) * dy - (point[1] - start[1]) * dx) / length;
    run = Math.max(run, distance);
  }
  const rise = run * Math.tan((pitchDeg * Math.PI) / 180);
  for (let i = 0; i < ring.length; i++)
    addEdgeToRidge(walls, roofs, ring[i], ring[(i + 1) % ring.length], start, end, y, rise, interior);
}

/**
 * Closed wall, floor and roof triangles for one lot. Null when the footprint cannot be drawn.
 * X = CE x, Y = height, Z = -CE y, matching the SVG frame.
 * Ordinary quadrilateral roofs default to a 4 m rise; structures can opt out.
 */
export function buildingSurfaces(
  polygon: readonly Point[],
  massing: BuildingMassing,
  options: { maximumRoofRiseMeters?: number } = {}
): BuildingSurfaces | null {
  const base = cleanRing(polygon);
  if (!base.length || !massing.floors.length) return null;
  const convex = isConvex(base);
  const jetty = convex ? massing.jettyMeters : 0;
  const walls: Bucket = { positions: [], normals: [] };
  const roofs: Bucket = { positions: [], normals: [] };
  const centre = centroid(base);
  const eave = massing.eaveHeightMeters;
  const interior = planVertex(centre, Math.max(eave * 0.45, 0.5));
  let y = 0;
  let previous = base;
  for (let level = 0; level < massing.floors.length; level++) {
    const distance = Math.min(JETTY_CAP_METERS, level * jetty);
    const ring = distance > 0 ? offsetConvex(base, distance) : base;
    const height = massing.floors[level].heightMeters;
    if (!(height > 0)) return null;
    for (let i = 0; i < ring.length; i++) addWall(walls, ring[i], ring[(i + 1) % ring.length], y, y + height, interior);
    if (level > 0 && distance > 0) addSoffit(walls, previous, ring, y);
    previous = ring;
    y += height;
  }
  addFloor(walls, base, interior);
  const form = convex ? massing.roof.form : "flat";
  if (form === "flat" || form === "dome") addFlatRoof(roofs, previous, y, interior);
  else
    addPitchedRoof(
      walls,
      roofs,
      previous,
      y,
      form,
      massing.roof.ridgeAzimuth,
      massing.roof.pitchDeg,
      interior,
      options.maximumRoofRiseMeters ?? 4
    );
  if (!walls.positions.length) return null;
  return { walls: toSoup(walls), roofs: toSoup(roofs) };
}

/** Every directed edge has a matching reverse edge, within `quant` metres. */
export function meshIsClosed(positions: Float32Array, quant = 1e-3): boolean {
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x / quant)},${Math.round(y / quant)},${Math.round(z / quant)}`;
  const count = new Map<string, number>();
  const bump = (from: string, to: string) => {
    const id = `${from}>${to}`;
    count.set(id, (count.get(id) ?? 0) + 1);
  };
  for (let i = 0; i < positions.length; i += 9) {
    const ids = [0, 1, 2].map(vertex =>
      key(positions[i + vertex * 3], positions[i + vertex * 3 + 1], positions[i + vertex * 3 + 2])
    );
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
    bump(ids[0], ids[1]);
    bump(ids[1], ids[2]);
    bump(ids[2], ids[0]);
  }
  if (!count.size) return false;
  for (const [id, times] of count) {
    const [from, to] = id.split(">");
    if ((count.get(`${to}>${from}`) ?? 0) !== times) return false;
  }
  return true;
}

export function concatPositions(...soups: TriangleSoup[]): Float32Array {
  const length = soups.reduce((sum, soup) => sum + soup.positions.length, 0);
  const out = new Float32Array(length);
  let offset = 0;
  for (const soup of soups) {
    out.set(soup.positions, offset);
    offset += soup.positions.length;
  }
  return out;
}
