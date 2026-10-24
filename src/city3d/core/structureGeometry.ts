import type { BuildingMassing, RoofForm } from "../../city-editor/types/contracts/buildingMassing";
import type { StructureMassing, StructureRoof } from "../../city-editor/types/contracts/structureMassing";
import type { Point } from "../../city-editor/types/primitives";
import { type BuildingSurfaces, buildingSurfaces, earClip, meshIsClosed, type TriangleSoup } from "./massingGeometry";
import { planVertex } from "./planFrame";

type V3 = [number, number, number];

interface Bucket {
  positions: number[];
  normals: number[];
}

const EMPTY: TriangleSoup = { positions: new Float32Array(), normals: new Float32Array() };
/** Civic buildings, fortifications and spires retain their specified roof pitch. */
const STRUCTURE_ROOF_OPTIONS = { maximumRoofRiseMeters: Infinity };

function toSoup(bucket: Bucket): TriangleSoup {
  return { positions: Float32Array.from(bucket.positions), normals: Float32Array.from(bucket.normals) };
}

function pushOriented(bucket: Bucket, a: V3, b: V3, c: V3, interior: V3): void {
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
  if (nx * (interior[0] - mx) + ny * (interior[1] - my) + nz * (interior[2] - mz) > 0) {
    [b, c] = [c, b];
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  bucket.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  bucket.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
}

function addWall(bucket: Bucket, a: Point, b: Point, y0: number, y1: number, interior: V3): void {
  addWallSpan(bucket, a, b, y0, y1, y0, y1, interior);
}

/** A span may rise from one end to the other. Each end keeps its own height. */
function addWallSpan(
  bucket: Bucket,
  a: Point,
  b: Point,
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  interior: V3
): void {
  pushOriented(bucket, planVertex(a, a0), planVertex(b, b0), planVertex(b, b1), interior);
  pushOriented(bucket, planVertex(a, a0), planVertex(b, b1), planVertex(a, a1), interior);
}

function closedLine(points: readonly Point[]): boolean {
  return (
    points.length > 3 &&
    Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 0.05
  );
}

function segmentNormals(points: readonly Point[], closed: boolean): Point[] {
  const count = closed ? points.length : points.length - 1;
  const normals: Point[] = [];
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    normals.push(length < 1e-6 ? [0, 1] : [-dy / length, dx / length]);
  }
  return normals;
}

/** Left side of the centre line. Miter length stays within 4× the offset. */
export function ribbonSidePoints(
  points: readonly Point[],
  distance: number,
  offsets?: readonly Point[]
): Point[] | null {
  if (points.length < 2 || !(Math.abs(distance) > 0)) return null;
  const closed = closedLine(points);
  const ring = closed ? points.slice(0, -1) : points;
  if (ring.length < 2) return null;
  if (offsets?.length === points.length)
    return ring.map((point, i) => [point[0] + offsets[i][0] * distance, point[1] + offsets[i][1] * distance]);
  const normals = segmentNormals(ring, closed);
  const side: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const previous = closed || i > 0 ? normals[(i - 1 + normals.length) % normals.length] : null;
    const next = closed || i < ring.length - 1 ? normals[Math.min(i, normals.length - 1)] : null;
    const a = previous ?? next!;
    const b = next ?? previous!;
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const length = Math.hypot(mx, my);
    if (length < 1e-6) {
      mx = a[0];
      my = a[1];
    } else {
      mx /= length;
      my /= length;
    }
    const denom = mx * b[0] + my * b[1];
    const scale = Math.abs(denom) < 0.25 ? distance / 0.25 : distance / denom;
    const clamped = Math.max(-Math.abs(distance) * 4, Math.min(Math.abs(distance) * 4, scale));
    side.push([ring[i][0] + mx * clamped, ring[i][1] + my * clamped]);
  }
  return side;
}

function stationLevels(value: number | readonly number[], count: number): number[] | null {
  if (typeof value === "number") return Array.from({ length: count }, () => value);
  return value.length === count ? value.slice() : null;
}

/**
 * `y0` and `y1` are one height for the whole ribbon, or one height per centre-line vertex.
 * A closed line repeats its first point; the offset ring drops that repeat and keeps the first height.
 */
function extrudeRibbon(
  points: readonly Point[],
  width: number,
  y0: number | readonly number[],
  y1: number | readonly number[],
  bucket: Bucket,
  offsets?: readonly Point[]
): boolean {
  if (!(width > 0) || points.length < 2) return false;
  const base = stationLevels(y0, points.length);
  const top = stationLevels(y1, points.length);
  if (!base || !top || base.some((level, index) => !(top[index] > level + 1e-4))) return false;
  const half = width / 2;
  const left = ribbonSidePoints(points, half, offsets);
  const right = ribbonSidePoints(points, -half, offsets);
  if (!left || !right || left.length !== right.length || left.length < 2) return false;
  const closed = closedLine(points);
  const count = closed ? left.length : left.length - 1;
  const level = (levels: number[], index: number) => levels[closed ? index % (points.length - 1) : index];
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % left.length;
    const low0 = level(base, i);
    const low1 = level(base, j);
    const high0 = level(top, i);
    const high1 = level(top, j);
    const interior = planVertex(
      [
        (left[i][0] + right[i][0] + left[j][0] + right[j][0]) / 4,
        (left[i][1] + right[i][1] + left[j][1] + right[j][1]) / 4
      ],
      (low0 + low1 + high0 + high1) / 4
    );
    addWallSpan(bucket, left[i], left[j], low0, high0, low1, high1, interior);
    addWallSpan(bucket, right[j], right[i], low1, high1, low0, high0, interior);
    if (!closed && i === 0) addWallSpan(bucket, right[i], left[i], low0, high0, low0, high0, interior);
    if (!closed && i === count - 1) addWallSpan(bucket, left[j], right[j], low1, high1, low1, high1, interior);
    const at = (point: Point, y: number) => planVertex(point, y);
    pushOriented(bucket, at(left[i], high0), at(right[i], high0), at(right[j], high1), interior);
    pushOriented(bucket, at(left[i], high0), at(right[j], high1), at(left[j], high1), interior);
    pushOriented(bucket, at(left[i], low0), at(right[j], low1), at(right[i], low0), interior);
    pushOriented(bucket, at(left[i], low0), at(left[j], low1), at(right[j], low1), interior);
  }
  return true;
}

function outwardSign(points: readonly Point[], anchor: Point): number {
  const closed = closedLine(points);
  const ring = closed ? points.slice(0, -1) : points;
  for (let i = 0; i + 1 < ring.length || (closed && i < ring.length); i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-3) continue;
    const nx = -dy / length;
    const ny = dx / length;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const away = nx * (mx - anchor[0]) + ny * (my - anchor[1]);
    if (Math.abs(away) > 1e-4) return away > 0 ? 1 : -1;
  }
  return 1;
}

function shiftLine(points: readonly Point[], distance: number): Point[] | null {
  const side = ribbonSidePoints(points, distance);
  if (!side) return null;
  return closedLine(points) ? [...side, side[0]] : side;
}

function lift(soup: TriangleSoup, y: number): TriangleSoup {
  if (!(y > 0) || !soup.positions.length) return soup;
  const positions = soup.positions.slice();
  for (let i = 1; i < positions.length; i += 3) positions[i] += y;
  return { positions, normals: soup.normals };
}

function appendSoup(bucket: Bucket, soup: TriangleSoup): void {
  bucket.positions.push(...soup.positions);
  bucket.normals.push(...soup.normals);
}

const ROOF_FORM: Record<StructureRoof, RoofForm> = {
  none: "flat",
  flat: "flat",
  gable: "gable",
  hip: "hip",
  pyramid: "pyramid"
};

function footprintMassing(structure: StructureMassing): BuildingMassing {
  const form = ROOF_FORM[structure.roof];
  return {
    storeys: 1,
    floors: [{ level: 0, use: "civic", heightMeters: structure.heightMeters }],
    cellar: false,
    jettyMeters: 0,
    eaveHeightMeters: structure.heightMeters,
    roof: {
      form,
      pitchDeg: structure.roofPitchDeg ?? (form === "pyramid" ? 50 : form === "gable" ? 40 : form === "hip" ? 35 : 2),
      ridgeAzimuth: structure.ridgeAzimuth ?? 0,
      material: "slate"
    },
    wall: structure.material === "wood" ? "timber-frame" : "stone",
    baseElevationMeters: 0,
    tint: 0.5
  };
}

function circle(center: Point, radius: number): Point[] {
  const ring: Point[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ring.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
  }
  return ring;
}

function centroid(ring: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const point of ring) {
    x += point[0];
    y += point[1];
  }
  return [x / ring.length, y / ring.length];
}

function addSpire(structure: StructureMassing, roofs: Bucket): void {
  const ring = structure.footprint;
  if (!ring || ring.length < 3) return;
  const centre = centroid(ring);
  let radius = Infinity;
  for (const point of ring) radius = Math.min(radius, Math.hypot(point[0] - centre[0], point[1] - centre[1]));
  radius = Math.max(1.2, Math.min(radius * 0.18, 4));
  const rise = Math.max(structure.heightMeters * 0.8, 6);
  const massing = footprintMassing({
    ...structure,
    footprint: circle(centre, radius),
    heightMeters: 0.4,
    roof: "pyramid",
    spire: false
  });
  massing.roof.pitchDeg = (Math.atan(rise / radius) * 180) / Math.PI;
  const surfaces = buildingSurfaces(circle(centre, radius), massing, STRUCTURE_ROOF_OPTIONS);
  if (!surfaces) return;
  appendSoup(roofs, lift(surfaces.walls, structure.baseElevationMeters + structure.heightMeters));
  appendSoup(roofs, lift(surfaces.roofs, structure.baseElevationMeters + structure.heightMeters));
}

/** Explicit walk levels also allow a taller wall body beside a terrace. */
function ribbonTops(structure: StructureMassing, count: number): number | number[] {
  if (structure.topElevationsMeters?.length === count) return structure.topElevationsMeters;
  if (structure.baseElevationsMeters?.length === count)
    return structure.baseElevationsMeters.map(level => level + structure.heightMeters);
  return structure.baseElevationMeters + structure.heightMeters;
}

function addParapet(structure: StructureMassing, roofs: Bucket): void {
  const line = structure.centerline;
  if (!line || structure.parapet === "none" || !(structure.parapetMeters > 0) || !(structure.parapetWidthMeters > 0))
    return;
  const width = structure.widthMeters ?? 0;
  const inset = Math.max(0, (width - structure.parapetWidthMeters) / 2);
  const y0 = ribbonTops(structure, line.length);
  const y1 = typeof y0 === "number" ? y0 + structure.parapetMeters : y0.map(level => level + structure.parapetMeters);
  const shifts =
    structure.parapet === "both" ? [inset, -inset] : [outwardSign(line, structure.anchor ?? [0, 0]) * inset];
  for (const shift of shifts) {
    const offsets = structure.ribbonOffsets;
    const shifted =
      offsets?.length === line.length
        ? line.map((point, i): Point => [point[0] + offsets[i][0] * shift, point[1] + offsets[i][1] * shift])
        : Math.abs(shift) > 0.05
          ? shiftLine(line, shift)
          : line;
    if (shifted) extrudeRibbon(shifted, structure.parapetWidthMeters, y0, y1, roofs, offsets);
  }
}

function slitWidth(ring: readonly Point[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  return Math.max(1e-3, 1e-4 * Math.hypot(maxX - minX, maxY - minY));
}

function pointInRing(point: Point, ring: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > point[1] === b[1] > point[1]) continue;
    const x = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (point[0] < x) inside = !inside;
  }
  return inside;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const same = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-8;
  if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) return false;
  const cross = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

function signedArea(ring: readonly Point[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Hole rings are stored clockwise. A reversed copy keeps the cut on the courtyard's right. */
function clockwiseHole(ring: readonly Point[]): Point[] {
  const copy = ring.map(point => [point[0], point[1]] as Point);
  return signedArea(copy) > 0 ? copy.reverse() : copy;
}

function closestSegmentPoints(a: Point, b: Point, c: Point, d: Point): { s: number; t: number; dist: number } {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const cdx = d[0] - c[0];
  const cdy = d[1] - c[1];
  const acx = a[0] - c[0];
  const acy = a[1] - c[1];
  const aa = abx * abx + aby * aby;
  const ee = cdx * cdx + cdy * cdy;
  const ff = cdx * acx + cdy * acy;
  const cc = abx * acx + aby * acy;
  const bb = abx * cdx + aby * cdy;
  const denom = aa * ee - bb * bb;
  let s = 0.5;
  let t = 0.5;
  if (denom > 1e-12 && aa > 1e-12 && ee > 1e-12) s = clampUnit((bb * ff - cc * ee) / denom);
  if (ee > 1e-12) t = (bb * s + ff) / ee;
  if (t < 0) {
    t = 0;
    if (aa > 1e-12) s = clampUnit(-cc / aa);
  } else if (t > 1) {
    t = 1;
    if (aa > 1e-12) s = clampUnit((bb - cc) / aa);
  }
  const px = a[0] + abx * s - (c[0] + cdx * t);
  const py = a[1] + aby * s - (c[1] + cdy * t);
  return { s, t, dist: Math.hypot(px, py) };
}

/**
 * Two points on an edge, one design-slit apart across the bridge.
 * Separation stays above the 1 mm weld so the slit does not collapse.
 */
function lipsOnEdge(a: Point, b: Point, along: number, bridge: Point, width: number): [Point, Point] | null {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const edge = Math.hypot(ex, ey);
  const span = Math.hypot(bridge[0], bridge[1]);
  if (edge < 1e-4 || span < 1e-6) return null;
  const align = Math.abs((-bridge[1] * ex + bridge[0] * ey) / (span * edge));
  if (align < 0.15) return null;
  const half = Math.max(width, 1e-3 * Math.SQRT2) / (2 * align);
  if (half * 2 > edge * 0.5) return null;
  const center = Math.min(Math.max(along * edge, half + edge * 0.01), edge - half - edge * 0.01);
  if (!(center > half) || center + half > edge) return null;
  const at = (distance: number): Point => [a[0] + (ex * distance) / edge, a[1] + (ey * distance) / edge];
  return [at(center - half), at(center + half)];
}

function hitsRing(a: Point, b: Point, ring: readonly Point[], hostEdge: number): boolean {
  for (let i = 0; i < ring.length; i++) {
    if (i === hostEdge) continue;
    if (segmentsCross(a, b, ring[i], ring[(i + 1) % ring.length])) return true;
  }
  return false;
}

function bridgeOne(outer: readonly Point[], holeIn: readonly Point[], width: number): Point[] | null {
  const hole = clockwiseHole(holeIn);
  const expected = Math.abs(signedArea(outer)) - Math.abs(signedArea(hole));
  const candidates: Array<{ dist: number; ring: Point[] }> = [];
  for (let i = 0; i < outer.length; i++) {
    const outerStart = outer[i];
    const outerEnd = outer[(i + 1) % outer.length];
    for (let j = 0; j < hole.length; j++) {
      const holeStart = hole[j];
      const holeEnd = hole[(j + 1) % hole.length];
      const close = closestSegmentPoints(outerStart, outerEnd, holeStart, holeEnd);
      if (!(close.dist > width)) continue;
      const bridge: Point = [
        holeStart[0] +
          (holeEnd[0] - holeStart[0]) * close.t -
          (outerStart[0] + (outerEnd[0] - outerStart[0]) * close.s),
        holeStart[1] + (holeEnd[1] - holeStart[1]) * close.t - (outerStart[1] + (outerEnd[1] - outerStart[1]) * close.s)
      ];
      const outerLips = lipsOnEdge(outerStart, outerEnd, close.s, bridge, width);
      const holeLips = lipsOnEdge(holeStart, holeEnd, close.t, bridge, width);
      if (!outerLips || !holeLips) continue;
      const [enterOuter, leaveOuter] = outerLips;
      const [leaveHole, enterHole] = holeLips;
      if (segmentsCross(enterOuter, enterHole, leaveOuter, leaveHole)) continue;
      if (hitsRing(enterOuter, enterHole, outer, i) || hitsRing(leaveOuter, leaveHole, outer, i)) continue;
      if (hitsRing(enterOuter, enterHole, hole, j) || hitsRing(leaveOuter, leaveHole, hole, j)) continue;
      const mid: Point = [
        outerStart[0] + (outerEnd[0] - outerStart[0]) * close.s + bridge[0] / 2,
        outerStart[1] + (outerEnd[1] - outerStart[1]) * close.s + bridge[1] / 2
      ];
      if (!pointInRing(mid, outer) || pointInRing(mid, hole)) continue;
      const ring: Point[] = [];
      for (let index = 0; index < outer.length; index++) {
        ring.push(outer[index]);
        if (index !== i) continue;
        ring.push(enterOuter, enterHole);
        for (let step = 1; step <= hole.length; step++) ring.push(hole[(j + step) % hole.length]);
        ring.push(leaveHole, leaveOuter);
      }
      const area = signedArea(ring);
      if (area < expected * 0.5 || area > expected * 1.02) continue;
      candidates.push({ dist: close.dist, ring });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);
  for (const candidate of candidates.slice(0, 8)) {
    if (earClip(candidate.ring).length >= candidate.ring.length - 2) return candidate.ring;
  }
  return null;
}

function bridgeHoles(outer: readonly Point[], holes: readonly Point[][], width: number): Point[] | null {
  let ring = outer.map(point => [point[0], point[1]] as Point);
  for (const hole of holes) {
    const bridged = bridgeOne(ring, hole, width);
    if (!bridged) return null;
    ring = bridged;
  }
  return ring.length >= 3 ? ring : null;
}

function interiorPoint(ring: readonly Point[]): Point | null {
  const order = ring
    .map((_, index) => index)
    .sort((i, j) => {
      const lengthOf = (index: number) => {
        const next = ring[(index + 1) % ring.length];
        return Math.hypot(next[0] - ring[index][0], next[1] - ring[index][1]);
      };
      return lengthOf(j) - lengthOf(i);
    });
  for (const index of order) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-4) continue;
    for (const distance of [0.2, 0.05, 0.01]) {
      const inset = Math.min(distance, length * 0.25);
      if (!(inset > 1e-4)) continue;
      const candidate: Point = [(a[0] + b[0]) / 2 - (dy / length) * inset, (a[1] + b[1]) / 2 + (dx / length) * inset];
      if (pointInRing(candidate, ring)) return candidate;
    }
  }
  return null;
}

/** Flat cap with holes. A finite slit lets the existing ear clipper see one ring. */
function solidSurfaces(structure: StructureMassing): BuildingSurfaces | null {
  const outer = structure.footprint;
  const holes = (structure.holes ?? []).filter(hole => hole.length >= 3);
  if (!outer || outer.length < 3 || !holes.length || !(structure.heightMeters > 0)) return null;
  if (structure.roof !== "flat" && structure.roof !== "none") return null;
  const ring = bridgeHoles(outer, holes, slitWidth(outer));
  if (!ring) return null;
  const sample = interiorPoint(ring);
  if (!sample) return null;
  const height = structure.heightMeters;
  const capInterior = planVertex(sample, height * 0.5);
  const walls: Bucket = { positions: [], normals: [] };
  const roofs: Bucket = { positions: [], normals: [] };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    const inset = Math.min(0.05, length * 0.25);
    const inward = planVertex(
      [(a[0] + b[0]) / 2 - (dy / length) * inset, (a[1] + b[1]) / 2 + (dx / length) * inset],
      height * 0.5
    );
    addWall(walls, a, b, 0, height, inward);
  }
  const triangles = earClip(ring);
  if (triangles.length < ring.length - 2) return null;
  for (const [i, j, k] of triangles) {
    pushOriented(
      roofs,
      planVertex(ring[i], height),
      planVertex(ring[j], height),
      planVertex(ring[k], height),
      capInterior
    );
    pushOriented(walls, planVertex(ring[i], 0), planVertex(ring[j], 0), planVertex(ring[k], 0), capInterior);
  }
  if (!walls.positions.length || !roofs.positions.length) return null;
  const surfaces = { walls: toSoup(walls), roofs: toSoup(roofs) };
  const positions = new Float32Array(surfaces.walls.positions.length + surfaces.roofs.positions.length);
  positions.set(surfaces.walls.positions);
  positions.set(surfaces.roofs.positions, surfaces.walls.positions.length);
  return meshIsClosed(positions) ? surfaces : null;
}

/** Closed triangles for one structure. Null when it cannot be drawn. */
export function structureSurfaces(structure: StructureMassing): BuildingSurfaces | null {
  if (structure.sections) return sectionSurfaces(structure.sections);
  const walls: Bucket = { positions: [], normals: [] };
  const roofs: Bucket = { positions: [], normals: [] };
  if (structure.centerline && structure.centerline.length >= 2 && structure.widthMeters) {
    const bases = structure.baseElevationsMeters;
    const sloped = bases !== undefined && bases.length === structure.centerline.length ? bases : undefined;
    const drawn = extrudeRibbon(
      structure.centerline,
      structure.widthMeters,
      sloped ?? structure.baseElevationMeters,
      ribbonTops(structure, structure.centerline.length),
      walls,
      structure.ribbonOffsets
    );
    if (!drawn) return null;
    addParapet(structure, roofs);
  } else if (structure.footprint && structure.footprint.length >= 3 && structure.heightMeters > 0) {
    const holed = (structure.holes?.length ?? 0) > 0;
    const surfaces = holed
      ? solidSurfaces(structure)
      : buildingSurfaces(structure.footprint, footprintMassing(structure), STRUCTURE_ROOF_OPTIONS);
    if (!surfaces) return null;
    appendSoup(walls, lift(surfaces.walls, structure.baseElevationMeters));
    appendSoup(roofs, lift(surfaces.roofs, structure.baseElevationMeters));
    if (structure.spire) addSpire(structure, roofs);
  } else return null;
  if (!walls.positions.length) return null;
  return {
    walls: toSoup(walls),
    roofs: roofs.positions.length ? toSoup(roofs) : EMPTY
  };
}

/** Corresponding vertices retain vertical sides; changing rings forms a talus. */
function sectionSurfaces(sections: NonNullable<StructureMassing["sections"]>): BuildingSurfaces | null {
  if (sections.length < 2) return null;
  const count = sections[0].footprint.length;
  if (
    count < 3 ||
    sections.some(
      section =>
        section.footprint.length !== count ||
        section.elevationsMeters.length !== count ||
        section.footprint.some(point => !point.every(Number.isFinite)) ||
        section.elevationsMeters.some(height => !Number.isFinite(height))
    )
  )
    return null;
  const walls: Bucket = { positions: [], normals: [] };
  const roofs: Bucket = { positions: [], normals: [] };
  const vertex = (section: number, index: number) =>
    planVertex(sections[section].footprint[index], sections[section].elevationsMeters[index]);
  for (let level = 1; level < sections.length; level++) {
    const center: V3 = [0, 0, 0];
    for (let i = 0; i < count; i++) {
      const a = vertex(level - 1, i),
        b = vertex(level, i);
      for (const axis of [0, 1, 2] as const) center[axis] += (a[axis] + b[axis]) / (count * 2);
    }
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      pushOriented(walls, vertex(level - 1, i), vertex(level - 1, j), vertex(level, j), center);
      pushOriented(walls, vertex(level - 1, i), vertex(level, j), vertex(level, i), center);
    }
  }
  for (const level of [0, sections.length - 1]) {
    const triangles = earClip(sections[level].footprint);
    if (triangles.length !== count - 2) return null;
    for (const [a, b, c] of triangles) {
      const av = vertex(level, a),
        bv = vertex(level, b),
        cv = vertex(level, c);
      const interior: V3 = [
        (av[0] + bv[0] + cv[0]) / 3,
        (av[1] + bv[1] + cv[1]) / 3 + (level === 0 ? 1 : -1),
        (av[2] + bv[2] + cv[2]) / 3
      ];
      pushOriented(level === 0 ? walls : roofs, av, bv, cv, interior);
    }
  }
  return { walls: toSoup(walls), roofs: toSoup(roofs) };
}
