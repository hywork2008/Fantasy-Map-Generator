// S7 — lots and building polygons (design §4.2 S7, TownGeneratorTS 2.6
// `buildGeometry`).
//
// Each warded cell is first inset from the "streets" that bound it — wall,
// plaza, artery, and river edges take MAIN_STREET/2; other inner edges
// REGULAR_STREET/2; outskirts ALLEY/2. Convex cells `shrink` (half-plane clip);
// concave cells `buffer` (vertex offset). The block is then split per ward:
// CommonWard-likes recurse on the longest edge (`createAlleys`); Castle /
// Cathedral use a coarser orthogonal split; Market (plaza) is a void with a
// statue; empty Ward emits nothing. The setback gaps ARE the intramural streets
// (design §4.2 S5 — those streets are deliberately not drawn).
//
// Street widths and the shrink/buffer + longest-edge split are public polygon
// algorithms described in TownGeneratorTS/docs/**; this file does not port GPL
// sources.

import {
  bufferPolygon,
  cleanRing,
  clipPolygonHalfPlane,
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonIsConvex,
  polygonPerimeter,
  shrinkPolygon,
  splitPolygon
} from "./geom";
import { close } from "./interior";
import { makeRng, type Rng } from "./prng";
import type {
  BorderLoop,
  Building,
  Cell,
  Point,
  Precinct,
  RiverPath,
  StreetNetwork,
  WardAssignment,
  WardKind
} from "./types";

/** Full street widths, metres. Setback on each side is half. */
export const MAIN_STREET = 12;
export const REGULAR_STREET = 7;
export const ALLEY = 4;

/** Target lot span, metres — the recursive split stops around here. Absolute
 * (a building frontage), NOT a fraction of the block, so a large ward-scale cell
 * still divides into many lots. */
const LOT_SPAN = 28;

const MAX_SPLIT_DEPTH = 6;
const EDGE_NEAR = 0.22; // × cellSize: "this cell edge runs along that line"

export interface BuildingInputs {
  cells: Cell[];
  wards: WardAssignment[];
  urban: Set<number>;
  sea: Set<number>;
  /** Closed water polygon, same source as `sea`. A coastal LAND cell's inset
   * can still leave a sliver over the water near the curved shoreline (§2.5 /
   * §3.D.3) even though the cell itself is not `sea` — this clips those. */
  waterPolygon: Point[] | null;
  borders: BorderLoop[];
  precincts: Precinct[];
  streets: StreetNetwork;
  riverPaths: RiverPath[];
  cellSizeMeters: number;
  seed: string;
}

/** Pure. Same interior geometry + wards + seed ⇒ identical buildings. */
export function buildGeometry(input: BuildingInputs): Building[] {
  const { cells, wards, urban, sea, waterPolygon, borders, precincts, streets, riverPaths, cellSizeMeters, seed } =
    input;
  if (!cells.length || !wards.length) return [];

  const byId = new Map(cells.map(c => [c.id, c]));
  const kindOf = new Map(wards.map(w => [w.cellId, w.kind]));
  const plazaIds = new Set(precincts.filter(p => p.kind === "plaza").flatMap(p => p.cellIds));
  const wallRings = borders.map(b => close(b.points)).filter(r => r.length >= 4);
  const plazaRings = [...plazaIds]
    .map(id => byId.get(id)?.polygon)
    .filter((p): p is Point[] => !!p && p.length >= 3)
    .map(p => close(p));
  const arteries = streets.arteries.filter(l => l.length >= 2);
  const rivers = riverPaths.filter(r => r.points.length >= 2);
  const near = cellSizeMeters * EDGE_NEAR;
  const rng = makeRng(`${seed}:program:lots`);

  const out: Building[] = [];
  for (const cell of cells.slice().sort((a, b) => a.id - b.id)) {
    const kind = kindOf.get(cell.id);
    if (!kind || kind === "empty" || sea.has(cell.id)) continue;
    const dists = edgeSetbacks(cell, { wallRings, plazaRings, arteries, rivers, urban, near });
    const block = cityBlock(cell.polygon, dists);
    if (block.length < 3) continue;
    const pieces = geometryFor(kind, block, plazaIds.has(cell.id), rng);
    const filtered = enclosed(cell, urban) ? pieces : filterOutskirts(pieces, cell);
    const ring = close(cell.polygon);
    const kept = filtered.filter(p => withinCell(p, cell.polygon, ring, waterPolygon));
    for (const polygon of kept) {
      if (polygon.length >= 3 && Math.abs(polygonArea(polygon)) > 4) {
        out.push({ polygon, ward: kind, cellId: cell.id });
      }
    }
  }
  return out;
}

export function cityBlock(poly: Point[], dists: number[]): Point[] {
  const inset = polygonIsConvex(poly) ? shrinkPolygon(poly, dists) : bufferPolygon(poly, dists);
  if (inset.length >= 3) return inset;
  const floor = Math.min(...dists, ALLEY / 2);
  return shrinkPolygon(
    poly,
    dists.map(() => floor)
  );
}

function edgeSetbacks(
  cell: Cell,
  ctx: {
    wallRings: Point[][];
    plazaRings: Point[][];
    arteries: Point[][];
    rivers: RiverPath[];
    urban: Set<number>;
    near: number;
  }
): number[] {
  const poly = cell.polygon;
  const dists: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const alongWall = ctx.wallRings.some(r => nearestOnPolyline(mid, r).dist < ctx.near);
    const alongPlaza = ctx.plazaRings.some(r => nearestOnPolyline(mid, r).dist < ctx.near);
    const alongArtery = ctx.arteries.some(r => nearestOnPolyline(mid, r).dist < ctx.near);
    const alongRiver = ctx.rivers.some(r => nearestOnPolyline(mid, r.points).dist < ctx.near + mean(r.widths) * 0.35);
    if (alongWall || alongPlaza || alongArtery || alongRiver) dists.push(MAIN_STREET / 2);
    else if (ctx.urban.has(cell.id)) dists.push(REGULAR_STREET / 2);
    else dists.push(ALLEY / 2);
  }
  return dists;
}

function geometryFor(kind: WardKind, block: Point[], isPlaza: boolean, rng: Rng): Point[][] {
  switch (kind) {
    case "empty":
      return [];
    case "market":
      return isPlaza ? marketObject(block, rng) : createAlleys(block, LOT_SPAN * 1.2, ALLEY / 2, rng);
    case "castle":
      return createOrtho(
        cityBlock(
          block,
          block.map(() => MAIN_STREET / 2)
        ),
        LOT_SPAN * 1.6,
        rng
      );
    case "cathedral":
      return rng() < 0.4 ? ringSlices(block, rng) : createOrtho(block, LOT_SPAN * 1.4, rng);
    case "park":
      return parkTrees(block, rng);
    case "farm":
      return farmLots(block, rng);
    case "military":
      return createAlleys(block, LOT_SPAN * 1.3, ALLEY * 0.7, rng);
    case "slum":
    case "shanty":
      return createAlleys(block, LOT_SPAN * 0.7, ALLEY / 3, rng);
    default:
      return createAlleys(block, LOT_SPAN, ALLEY / 2, rng);
  }
}

/** Longest-edge recursive bipartition. `gap` is the alley opened on each cut. */
export function createAlleys(poly: Point[], minLen: number, gap: number, rng: Rng, depth = 0): Point[][] {
  const ring = cleanRing(poly);
  if (ring.length < 3 || depth > MAX_SPLIT_DEPTH) return ring.length >= 3 ? [ring] : [];
  const { length, index } = longestEdge(ring);
  const area = Math.abs(polygonArea(ring));
  if (length < minLen * 1.5 || area < minLen * minLen * 0.6) return [ring];

  const a = ring[index];
  const b = ring[(index + 1) % ring.length];
  const t = 0.38 + rng() * 0.24;
  const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // Bisect PERPENDICULAR to the longest edge: the separating normal is the edge
  // direction, so both half-planes actually cross the polygon interior.
  const el = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: Point = [(b[0] - a[0]) / el, (b[1] - a[1]) / el];

  const [left, right] = splitPolygon(ring, p, n, gap);
  const kids: Point[][] = [];
  if (left.length >= 3) kids.push(...createAlleys(left, minLen, gap, rng, depth + 1));
  if (right.length >= 3) kids.push(...createAlleys(right, minLen, gap, rng, depth + 1));
  return kids.length ? kids : [ring];
}

function createOrtho(poly: Point[], minLen: number, rng: Rng, depth = 0): Point[][] {
  const ring = cleanRing(poly);
  if (ring.length < 3) return [];
  if (depth > 3) return [ring];
  const { length, index } = longestEdge(ring);
  if (length < minLen * 1.8 || Math.abs(polygonArea(ring)) < minLen * minLen) return [ring];
  const a = ring[index];
  const b = ring[(index + 1) % ring.length];
  const t = 0.45 + rng() * 0.1;
  const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const el = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: Point = [(b[0] - a[0]) / el, (b[1] - a[1]) / el];
  const [left, right] = splitPolygon(ring, p, n, ALLEY / 3);
  const kids: Point[][] = [];
  if (left.length >= 3) kids.push(...createOrtho(left, minLen, rng, depth + 1));
  if (right.length >= 3) kids.push(...createOrtho(right, minLen, rng, depth + 1));
  return kids.length ? kids : [ring];
}

function ringSlices(poly: Point[], rng: Rng): Point[][] {
  const ring = cleanRing(poly);
  if (ring.length < 3) return [];
  const span = Math.sqrt(Math.abs(polygonArea(ring)));
  const thickness = Math.min((polygonPerimeter(ring) / (2 * Math.PI)) * 0.45, span * 0.28);
  const hole = shrinkPolygon(
    ring,
    ring.map(() => thickness)
  );
  if (hole.length < 3) return createOrtho(ring, 14, rng);
  const c = polygonCentroid(ring);
  const slices = 4 + rng.int(0, 3);
  const out: Point[][] = [];
  for (let i = 0; i < slices; i++) {
    const a0 = (i / slices) * Math.PI * 2 - Math.PI / slices;
    const a1 = ((i + 1) / slices) * Math.PI * 2 - Math.PI / slices;
    const n0: Point = [Math.cos(a0), Math.sin(a0)];
    const n1: Point = [-Math.cos(a1), -Math.sin(a1)];
    const wedge = clipPolygonHalfPlane(clipPolygonHalfPlane(ring, c, n0), c, n1);
    if (wedge.length < 3) continue;
    const inner = shrinkPolygon(
      wedge,
      wedge.map(() => thickness)
    );
    const piece = inner.length >= 3 ? stitchRing(wedge, inner) : wedge;
    if (piece.length >= 3) out.push(piece);
  }
  return out.length ? out : [ring];
}

function stitchRing(outer: Point[], inner: Point[]): Point[] {
  const o = cleanRing(outer);
  const inn = cleanRing(inner);
  if (o.length < 3 || inn.length < 3) return o;
  let oi = 0;
  let ii = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < o.length; i++) {
    for (let j = 0; j < inn.length; j++) {
      const d = Math.hypot(o[i][0] - inn[j][0], o[i][1] - inn[j][1]);
      if (d < best) {
        best = d;
        oi = i;
        ii = j;
      }
    }
  }
  const out: Point[] = [];
  for (let k = 0; k < o.length; k++) out.push(o[(oi + k) % o.length]);
  out.push(o[oi]);
  for (let k = 0; k <= inn.length; k++) out.push(inn[(ii - k + inn.length * 8) % inn.length]);
  return cleanRing(out);
}

function marketObject(block: Point[], rng: Rng): Point[][] {
  const c = polygonCentroid(block);
  const span = Math.sqrt(Math.abs(polygonArea(block)));
  const s = Math.max(4, span * (0.08 + rng() * 0.04));
  if (rng() < 0.6) {
    return [
      [
        [c[0] - s, c[1] - s * 0.6],
        [c[0] + s, c[1] - s * 0.6],
        [c[0] + s, c[1] + s * 0.6],
        [c[0] - s, c[1] + s * 0.6]
      ]
    ];
  }
  const circle: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    circle.push([c[0] + Math.cos(a) * s, c[1] + Math.sin(a) * s]);
  }
  return [circle];
}

function parkTrees(block: Point[], rng: Rng): Point[][] {
  const c = polygonCentroid(block);
  const span = Math.sqrt(Math.abs(polygonArea(block)));
  const r = Math.max(2.5, span * 0.08);
  const n = 3 + rng.int(0, 5);
  const trees: Point[][] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rng() * 0.2;
    const dist = span * (0.18 + rng() * 0.22);
    const p: Point = [c[0] + Math.cos(ang) * dist, c[1] + Math.sin(ang) * dist];
    const tree: Point[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      tree.push([p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]);
    }
    trees.push(tree);
  }
  return trees;
}

function farmLots(block: Point[], rng: Rng): Point[][] {
  const field = cityBlock(
    block,
    block.map(() => Math.sqrt(Math.abs(polygonArea(block))) * (0.12 + rng() * 0.08))
  );
  if (field.length < 3) return [];
  return createOrtho(field, LOT_SPAN * 2, rng);
}

/** A building piece is kept only if it sits inside the cell with at least a
 * minimal setback from every cell edge — guards against the mangled slivers
 * Sutherland–Hodgman clipping can leave when the recursive split runs on a
 * concave block — and, separately, is not itself out over the water: a coastal
 * LAND cell's polygon can dip slightly into the curved shoreline even though
 * the cell is not tagged `sea` (§2.5 / §3.D.3). */
function withinCell(piece: Point[], poly: Point[], ring: Point[], waterPolygon: Point[] | null): boolean {
  if (waterPolygon && waterPolygon.length >= 3 && pointInPolygon(polygonCentroid(piece), waterPolygon)) return false;
  const floor = ALLEY / 2 - 0.6;
  for (const v of piece) {
    if (!pointInPolygon(v, poly)) return false;
    if (nearestOnPolyline(v, ring).dist < floor) return false;
  }
  return true;
}

function enclosed(cell: Cell, urban: Set<number>): boolean {
  if (!urban.has(cell.id) || cell.onBorder) return false;
  return cell.neighbors.length >= 4 && cell.neighbors.every(n => urban.has(n));
}

function filterOutskirts(pieces: Point[][], cell: Cell): Point[][] {
  const c = cell.centroid;
  const reach = Math.max(...cell.polygon.map(p => Math.hypot(p[0] - c[0], p[1] - c[1])), 1);
  return pieces.filter(p => {
    const q = polygonCentroid(p);
    return Math.hypot(q[0] - c[0], q[1] - c[1]) <= reach * 0.62;
  });
}

function longestEdge(poly: Point[]): { length: number; index: number } {
  let index = 0;
  let length = -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > length) {
      length = len;
      index = i;
    }
  }
  return { length, index };
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
