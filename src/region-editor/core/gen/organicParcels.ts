import type { Point } from "../types";
import { clipConvex, polygonArea, subtractConvex } from "./landUseGeometry";

/**
 * Irregular field parcels: a jittered-lattice Voronoi mosaic stretched along one axis.
 * Every parcel is convex, so the existing convex clip/subtract helpers stay valid, but unlike
 * square or triangle tiles the outlines look like enclosed fields rather than a survey grid.
 * The lattice lives in world coordinates and is keyed by (level, angle, i, j), so adjacent cells and
 * differently-windowed regions cut the same underlying parcels.
 */
export interface Parcel {
  key: string;
  /** Convex pieces (world coordinates) of the parcel inside the requested boundary. */
  pieces: Point[][];
  center: Point;
}

const JITTER = 0.76;
const STRETCH: Point = [1.35, 0.85];
const NEIGHBOURHOOD = 2;
const ANGLE_STEPS = 12;

function unit(a: number, b: number, salt: number): number {
  let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(salt, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1103515245);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Keeps the half-plane `(p - mid) . normal <= 0`. */
function clipHalfPlane(poly: Point[], mid: Point, normal: Point): Point[] {
  const out: Point[] = [];
  const side = (p: Point) => (p[0] - mid[0]) * normal[0] + (p[1] - mid[1]) * normal[1];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    const sp = side(p),
      sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

function lattice(i: number, j: number, salt: number): Point {
  return [i + 0.5 + (unit(i, j, salt) - 0.5) * JITTER, j + 0.5 + (unit(j, i, salt + 7919) - 0.5) * JITTER];
}

function voronoi(i: number, j: number, salt: number): Point[] {
  const s = lattice(i, j, salt);
  const reach = NEIGHBOURHOOD - 0.4;
  let poly: Point[] = [
    [s[0] - reach, s[1] - reach],
    [s[0] + reach, s[1] - reach],
    [s[0] + reach, s[1] + reach],
    [s[0] - reach, s[1] + reach]
  ];
  for (let di = -NEIGHBOURHOOD; di <= NEIGHBOURHOOD && poly.length; di++)
    for (let dj = -NEIGHBOURHOOD; dj <= NEIGHBOURHOOD && poly.length; dj++) {
      if (!di && !dj) continue;
      const n = lattice(i + di, j + dj, salt);
      poly = clipHalfPlane(poly, [(s[0] + n[0]) / 2, (s[1] + n[1]) / 2], [n[0] - s[0], n[1] - s[1]]);
    }
  return poly;
}

export interface ParcelOptions {
  /** Convex boundary in world coordinates. */
  boundary: Point[];
  /** Mean parcel spacing in world units. Quantised internally to keep lattices shared. */
  spacing: number;
  /** Field orientation in radians; quantised to 15 degrees. */
  angle: number;
  salt?: number;
  /** Hard cap on parcels examined, as a safety valve for degenerate boundaries. */
  maxParcels?: number;
}

/** Spacing snapped to a half-octave ladder so neighbouring cells of similar size share a lattice. */
export function quantizeSpacing(spacing: number): { level: number; spacing: number } {
  const level = Math.round(Math.log2(Math.max(spacing, 1e-9)) * 2);
  return { level, spacing: 2 ** (level / 2) };
}

export function buildParcels(options: ParcelOptions): Parcel[] {
  const { boundary } = options;
  if (boundary.length < 3) return [];
  const { level, spacing } = quantizeSpacing(options.spacing);
  const step = Math.round((((options.angle % Math.PI) + Math.PI) % Math.PI) / (Math.PI / ANGLE_STEPS)) % ANGLE_STEPS;
  const angle = (step * Math.PI) / ANGLE_STEPS;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const salt = (options.salt ?? 0) ^ Math.imul(level, 2654435761) ^ step;
  const toWorld = (p: Point): Point => {
    const u = p[0] * spacing * STRETCH[0],
      v = p[1] * spacing * STRETCH[1];
    return [u * cos - v * sin, u * sin + v * cos];
  };
  const toLattice = (p: Point): Point => {
    const u = p[0] * cos + p[1] * sin,
      v = -p[0] * sin + p[1] * cos;
    return [u / (spacing * STRETCH[0]), v / (spacing * STRETCH[1])];
  };
  const bounds = boundary.map(toLattice);
  const minI = Math.floor(Math.min(...bounds.map(p => p[0]))) - 1,
    maxI = Math.ceil(Math.max(...bounds.map(p => p[0]))) + 1,
    minJ = Math.floor(Math.min(...bounds.map(p => p[1]))) - 1,
    maxJ = Math.ceil(Math.max(...bounds.map(p => p[1]))) + 1;
  const bx = boundary.map(p => p[0]),
    by = boundary.map(p => p[1]);
  const x0 = Math.min(...bx),
    x1 = Math.max(...bx),
    y0 = Math.min(...by),
    y1 = Math.max(...by);
  const parcels: Parcel[] = [];
  const cap = options.maxParcels ?? 4000;
  for (let i = minI; i <= maxI; i++)
    for (let j = minJ; j <= maxJ; j++) {
      if (parcels.length >= cap) return parcels;
      const polygon = voronoi(i, j, salt).map(toWorld);
      if (polygon.length < 3) continue;
      let px0 = Infinity,
        py0 = Infinity,
        px1 = -Infinity,
        py1 = -Infinity;
      for (const p of polygon) {
        px0 = Math.min(px0, p[0]);
        py0 = Math.min(py0, p[1]);
        px1 = Math.max(px1, p[0]);
        py1 = Math.max(py1, p[1]);
      }
      if (px1 < x0 || px0 > x1 || py1 < y0 || py0 > y1) continue;
      const clipped = clipConvex(polygon, boundary);
      if (!clipped.length || polygonArea(clipped) < 1e-10) continue;
      parcels.push({
        key: `${level}:${step}:${i}:${j}`,
        pieces: [clipped],
        center: toWorld(lattice(i, j, salt))
      });
    }
  return parcels;
}

/** Removes `obstacle` from every piece; pieces stay convex because the obstacle is convex. */
export function subtractFromPieces(
  pieces: Point[][],
  obstacle: Point[],
  overlaps: (a: Point[], b: Point[]) => boolean
) {
  return pieces.flatMap(piece => (overlaps(piece, obstacle) ? subtractConvex(piece, obstacle) : [piece]));
}

export function pieceCentroid(piece: Point[]): Point {
  let x = 0,
    y = 0;
  for (const p of piece) {
    x += p[0];
    y += p[1];
  }
  return [x / piece.length, y / piece.length];
}

/** Scale each convex piece about its own centroid so the pieces total exactly `target` area. */
export function shrinkPiecesToArea(pieces: Point[][], target: number): Point[][] {
  const total = pieces.reduce((s, p) => s + polygonArea(p), 0);
  if (!(target > 0) || !(total > 0)) return [];
  if (total <= target) return pieces;
  const factor = Math.sqrt(target / total);
  return pieces.map(piece => {
    const c = pieceCentroid(piece);
    return piece.map(p => [c[0] + (p[0] - c[0]) * factor, c[1] + (p[1] - c[1]) * factor] as Point);
  });
}

/** Pulls a convex piece slightly toward its centroid: a hedgerow gap that also keeps neighbours strictly disjoint. */
export function insetPiece(piece: Point[], factor = 0.985): Point[] {
  const c = pieceCentroid(piece);
  return piece.map(p => [c[0] + (p[0] - c[0]) * factor, c[1] + (p[1] - c[1]) * factor] as Point);
}
