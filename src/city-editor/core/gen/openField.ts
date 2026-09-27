// Open-field furlongs for a farm ward. A coarse evolution cell is one holding,
// not one field: it is cut into headland-separated furlongs whose ridge-and-
// furrow runs a few dozen metres, and neighbouring holdings turn.

import type { Point } from "../types";
import { clipPolygonHalfPlane, polygonArea, splitPolygon } from "./geom";
import { chord } from "./localInfill";
import { makeRng } from "./prng";

/** Selion spacing in the greyfield sample's lower-left countryside. */
const FURROW_SPACING_M = 4;
/** Width across the ridges of one furlong, about eight selions. */
const FURLONG_ACROSS_M = 32;
/** Plough length before a headland. Longer runs are separate furlongs. */
const FURLONG_ALONG_M = 70;
/** Unploughed balk between furlongs. Wide enough to read at town scale. */
const HEADLAND_M = 4.5;
/** A patch larger than this on both axes is two holdings, and one of them turns. */
const TURN_LONG_M = 88;
const TURN_SHORT_M = 46;

export interface OpenFieldPlot {
  polygon: Point[];
  rows: Point[][];
}

/** Ridge-and-furrow furlongs filling `polygon`. `alongRadians` is the first
 * plough direction; the seed turns later holdings. */
export function openFieldPlots(polygon: Point[], alongRadians: number, seed: string): OpenFieldPlot[] {
  if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 150) return [];
  return lay(polygon, alongRadians, makeRng(seed), 0);
}

function lay(poly: Point[], alongRadians: number, rng: ReturnType<typeof makeRng>, depth: number): OpenFieldPlot[] {
  const along = unit(alongRadians);
  const across: Point = [-along[1], along[0]];
  const alongSpan = span(poly, along);
  const acrossSpan = span(poly, across);
  if (
    depth < 8 &&
    alongSpan > TURN_SHORT_M &&
    acrossSpan > TURN_SHORT_M &&
    Math.max(alongSpan, acrossSpan) > TURN_LONG_M
  ) {
    const normal = alongSpan >= acrossSpan ? along : across;
    const { min, max } = range(poly, normal);
    const mid = (min + max) / 2;
    const [left, right] = splitPolygon(poly, [normal[0] * mid, normal[1] * mid], normal, HEADLAND_M);
    if (usable(left) && usable(right)) {
      const turn = ((rng() < 0.5 ? -1 : 1) * (50 + rng() * 40) * Math.PI) / 180;
      return [...lay(left, alongRadians, rng, depth + 1), ...lay(right, alongRadians + turn, rng, depth + 1)];
    }
  }
  if (alongSpan > FURLONG_ALONG_M * 1.4) {
    const parts = sliceBands(poly, along, FURLONG_ALONG_M, HEADLAND_M);
    if (parts.length > 1) return parts.flatMap(part => lay(part, alongRadians, rng, depth + 1));
  }
  if (acrossSpan > FURLONG_ACROSS_M * 1.4) {
    const parts = sliceBands(poly, across, FURLONG_ACROSS_M, HEADLAND_M);
    if (parts.length > 1) return parts.flatMap(part => lay(part, alongRadians, rng, depth + 1));
  }
  const rows = furrows(poly, across);
  return rows.length >= 2 ? [{ polygon: poly, rows }] : [];
}

function furrows(poly: Point[], normal: Point): Point[][] {
  const { min, max } = range(poly, normal);
  const rows: Point[][] = [];
  for (let offset = min + FURROW_SPACING_M * 0.55; offset < max - 0.3; offset += FURROW_SPACING_M) {
    const row = chord(poly, normal, offset);
    if (!row) continue;
    const length = Math.hypot(row[1][0] - row[0][0], row[1][1] - row[0][1]);
    if (length >= 12) rows.push(row);
  }
  return rows;
}

/** Equal bands along `normal`, with a balk on every interior cut. */
function sliceBands(poly: Point[], normal: Point, width: number, gap: number): Point[][] {
  const { min, max } = range(poly, normal);
  const span = max - min;
  if (span <= width * 1.4) return [poly];
  const count = Math.max(2, Math.round(span / width));
  const band = span / count;
  const parts: Point[][] = [];
  for (let i = 0; i < count; i++) {
    const lo = min + i * band + (i === 0 ? 0 : gap / 2);
    const hi = min + (i + 1) * band - (i === count - 1 ? 0 : gap / 2);
    let piece = clipPolygonHalfPlane(poly, [normal[0] * lo, normal[1] * lo], normal);
    piece = clipPolygonHalfPlane(piece, [normal[0] * hi, normal[1] * hi], [-normal[0], -normal[1]]);
    if (usable(piece)) parts.push(piece);
  }
  return parts.length > 1 ? parts : [poly];
}

function usable(poly: Point[]): boolean {
  return poly.length >= 3 && Math.abs(polygonArea(poly)) >= 120;
}

function unit(radians: number): Point {
  return [Math.cos(radians), Math.sin(radians)];
}

function range(poly: Point[], normal: Point): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const point of poly) {
    const value = point[0] * normal[0] + point[1] * normal[1];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

function span(poly: Point[], normal: Point): number {
  const { min, max } = range(poly, normal);
  return max - min;
}
