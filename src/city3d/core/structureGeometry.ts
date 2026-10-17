import type { BuildingMassing, RoofForm } from "../../city-editor/types/contracts/buildingMassing";
import type { StructureMassing, StructureRoof } from "../../city-editor/types/contracts/structureMassing";
import type { Point } from "../../city-editor/types/primitives";
import { type BuildingSurfaces, buildingSurfaces, type TriangleSoup } from "./massingGeometry";
import { planVertex } from "./planFrame";

type V3 = [number, number, number];

interface Bucket {
  positions: number[];
  normals: number[];
}

const EMPTY: TriangleSoup = { positions: new Float32Array(), normals: new Float32Array() };

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
  const a0 = planVertex(a, y0);
  const b0 = planVertex(b, y0);
  const a1 = planVertex(a, y1);
  const b1 = planVertex(b, y1);
  pushOriented(bucket, a0, b0, b1, interior);
  pushOriented(bucket, a0, b1, a1, interior);
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
function offsetSide(points: readonly Point[], distance: number): Point[] | null {
  if (points.length < 2 || !(Math.abs(distance) > 0)) return null;
  const closed = closedLine(points);
  const ring = closed ? points.slice(0, -1) : points;
  if (ring.length < 2) return null;
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

function extrudeRibbon(points: readonly Point[], width: number, y0: number, y1: number, bucket: Bucket): boolean {
  if (!(width > 0) || !(y1 > y0 + 1e-4)) return false;
  const half = width / 2;
  const left = offsetSide(points, half);
  const right = offsetSide(points, -half);
  if (!left || !right || left.length !== right.length || left.length < 2) return false;
  const closed = closedLine(points);
  const count = closed ? left.length : left.length - 1;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % left.length;
    const interior = planVertex(
      [
        (left[i][0] + right[i][0] + left[j][0] + right[j][0]) / 4,
        (left[i][1] + right[i][1] + left[j][1] + right[j][1]) / 4
      ],
      (y0 + y1) / 2
    );
    addWall(bucket, left[i], left[j], y0, y1, interior);
    addWall(bucket, right[j], right[i], y0, y1, interior);
    if (!closed && i === 0) addWall(bucket, right[i], left[i], y0, y1, interior);
    if (!closed && i === count - 1) addWall(bucket, left[j], right[j], y0, y1, interior);
    const top = (a: Point, b: Point, c: Point) =>
      pushOriented(bucket, planVertex(a, y1), planVertex(b, y1), planVertex(c, y1), interior);
    const bottom = (a: Point, b: Point, c: Point) =>
      pushOriented(bucket, planVertex(a, y0), planVertex(b, y0), planVertex(c, y0), interior);
    top(left[i], right[i], right[j]);
    top(left[i], right[j], left[j]);
    bottom(left[i], right[j], right[i]);
    bottom(left[i], left[j], right[j]);
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
  const side = offsetSide(points, distance);
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
      pitchDeg: form === "pyramid" ? 50 : form === "gable" ? 40 : form === "hip" ? 35 : 2,
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
  const surfaces = buildingSurfaces(circle(centre, radius), massing);
  if (!surfaces) return;
  appendSoup(roofs, lift(surfaces.walls, structure.baseElevationMeters + structure.heightMeters));
  appendSoup(roofs, lift(surfaces.roofs, structure.baseElevationMeters + structure.heightMeters));
}

function addParapet(structure: StructureMassing, roofs: Bucket): void {
  const line = structure.centerline;
  if (!line || structure.parapet === "none" || !(structure.parapetMeters > 0) || !(structure.parapetWidthMeters > 0))
    return;
  const width = structure.widthMeters ?? 0;
  const inset = Math.max(0, (width - structure.parapetWidthMeters) / 2);
  const y0 = structure.baseElevationMeters + structure.heightMeters;
  const y1 = y0 + structure.parapetMeters;
  const shifts =
    structure.parapet === "both" ? [inset, -inset] : [outwardSign(line, structure.anchor ?? [0, 0]) * inset];
  for (const shift of shifts) {
    const shifted = Math.abs(shift) > 0.05 ? shiftLine(line, shift) : line;
    if (shifted) extrudeRibbon(shifted, structure.parapetWidthMeters, y0, y1, roofs);
  }
}

/** Closed triangles for one structure. Null when it cannot be drawn. */
export function structureSurfaces(structure: StructureMassing): BuildingSurfaces | null {
  const walls: Bucket = { positions: [], normals: [] };
  const roofs: Bucket = { positions: [], normals: [] };
  if (structure.centerline && structure.centerline.length >= 2 && structure.widthMeters) {
    const drawn = extrudeRibbon(
      structure.centerline,
      structure.widthMeters,
      structure.baseElevationMeters,
      structure.baseElevationMeters + structure.heightMeters,
      walls
    );
    if (!drawn) return null;
    addParapet(structure, roofs);
  } else if (structure.footprint && structure.footprint.length >= 3 && structure.heightMeters > 0) {
    const surfaces = buildingSurfaces(structure.footprint, footprintMassing(structure));
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
