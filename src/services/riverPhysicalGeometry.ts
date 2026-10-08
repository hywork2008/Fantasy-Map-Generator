import type { PhysicalRiverAxis } from "./riverAxisSampling";
import { RIVER_GEOMETRY_TOLERANCE, type RiverPoint } from "./riverGeometry";

/** All coordinates and distances in this contract are metres. Rings are unclosed.
 * Edge i joins points[i] to points[(i+1)%length]. Null references denote caps,
 * islands, or unresolved boundaries and cannot supply a bridge's local banks.
 */
export interface RiverBankReference {
  side: "left" | "right";
  arcStart: number;
  arcEnd: number;
}
export interface PhysicalWaterPolygon {
  id: number;
  rings: readonly (readonly RiverPoint[])[];
  /** Same indexing as rings; optional for water other than the target river. */
  bankReferences?: readonly (readonly (RiverBankReference | null)[])[];
}
export interface PhysicalRiverGeometry {
  axis: PhysicalRiverAxis;
  water: PhysicalWaterPolygon;
}
export const cross2 = (a: RiverPoint, b: RiverPoint) => a[0] * b[1] - a[1] * b[0];
const epsilon = RIVER_GEOMETRY_TOLERANCE;

/** Conservative input validation; callers should cache validated geometry by version.
 * Self-intersections and touching rings do not provide an unambiguous water interior.
 */
const validRingsCache = new WeakMap<readonly (readonly RiverPoint[])[], boolean>();

export function validWaterPolygon(water: PhysicalWaterPolygon): boolean {
  if (!water?.rings?.length) return false;
  const cached = validRingsCache.get(water.rings);
  if (cached !== undefined) return cached;
  const result = checkValidWaterPolygon(water);
  validRingsCache.set(water.rings, result);
  return result;
}

/** The same check without the cache, for short-lived polygons built per call (deck footprints). */
export function validTransientWaterPolygon(water: PhysicalWaterPolygon): boolean {
  return !!water?.rings?.length && checkValidWaterPolygon(water);
}

function checkValidWaterPolygon(water: PhysicalWaterPolygon): boolean {
  if (!water.rings.length) return false;
  for (let r = 0; r < water.rings.length; r++) {
    const ring = water.rings[r];
    if (
      ring.length < 3 ||
      ring.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1])) ||
      (water.bankReferences && water.bankReferences[r]?.length !== ring.length)
    )
      return false;
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const edgeLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!Number.isFinite(edgeLength) || edgeLength <= epsilon) return false;
      area += (a[0] - ring[0][0]) * (b[1] - ring[0][1]) - (a[1] - ring[0][1]) * (b[0] - ring[0][0]);
      const ref = water.bankReferences?.[r]?.[i];
      if (
        ref &&
        (!Number.isFinite(ref.arcStart) ||
          !Number.isFinite(ref.arcEnd) ||
          ref.arcStart < 0 ||
          ref.arcEnd < 0 ||
          !["left", "right"].includes(ref.side))
      )
        return false;
    }
    if (!Number.isFinite(area) || Math.abs(area) <= epsilon * epsilon) return false;
  }
  // Fast path for small single-ring polygons without allocation overhead
  if (water.rings.length === 1 && water.rings[0].length <= 32) {
    const ring = water.rings[0];
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i],
        b = ring[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const c = ring[j],
          d = ring[(j + 1) % n];
        if (segmentsTouch(a, b, c, d)) return false;
      }
    }
    return true;
  }
  // Sweep edge envelopes without per-edge object allocations.
  let totalEdges = 0;
  for (let r = 0; r < water.rings.length; r++) totalEdges += water.rings[r].length;

  const edgeRing = new Int32Array(totalEdges);
  const edgeIndex = new Int32Array(totalEdges);
  const edgeCount = new Int32Array(totalEdges);
  const edgeMinX = new Float64Array(totalEdges);
  const edgeMaxX = new Float64Array(totalEdges);
  const edgeMinY = new Float64Array(totalEdges);
  const edgeMaxY = new Float64Array(totalEdges);
  const order = new Int32Array(totalEdges);

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  let e = 0;
  for (let r = 0; r < water.rings.length; r++) {
    const ring = water.rings[r];
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i],
        b = ring[(i + 1) % n];
      const ex0 = Math.min(a[0], b[0]) - epsilon;
      const ex1 = Math.max(a[0], b[0]) + epsilon;
      const ey0 = Math.min(a[1], b[1]) - epsilon;
      const ey1 = Math.max(a[1], b[1]) + epsilon;
      edgeRing[e] = r;
      edgeIndex[e] = i;
      edgeCount[e] = n;
      edgeMinX[e] = ex0;
      edgeMaxX[e] = ex1;
      edgeMinY[e] = ey0;
      edgeMaxY[e] = ey1;
      order[e] = e;
      if (ex0 < minX) minX = ex0;
      if (ex1 > maxX) maxX = ex1;
      if (ey0 < minY) minY = ey0;
      if (ey1 > maxY) maxY = ey1;
      e++;
    }
  }

  const axis = maxX - minX >= maxY - minY ? "X" : "Y";
  const primaryMin = axis === "X" ? edgeMinX : edgeMinY;
  const primaryMax = axis === "X" ? edgeMaxX : edgeMaxY;

  order.sort((i, j) => primaryMin[i] - primaryMin[j]);

  for (let oi = 0; oi < totalEdges; oi++) {
    const i = order[oi];
    const maxPrimary = primaryMax[i];
    const rA = edgeRing[i];
    const idxA = edgeIndex[i];
    const cntA = edgeCount[i];
    const ringA = water.rings[rA];
    const aA = ringA[idxA];
    const bA = ringA[(idxA + 1) % cntA];
    const minXA = edgeMinX[i];
    const maxXA = edgeMaxX[i];
    const minYA = edgeMinY[i];
    const maxYA = edgeMaxY[i];

    for (let oj = oi + 1; oj < totalEdges && primaryMin[order[oj]] <= maxPrimary; oj++) {
      const j = order[oj];
      if (maxYA < edgeMinY[j] || edgeMaxY[j] < minYA || maxXA < edgeMinX[j] || edgeMaxX[j] < minXA) continue;
      const rB = edgeRing[j];
      const idxB = edgeIndex[j];
      if (rA === rB && (Math.abs(idxA - idxB) === 1 || Math.abs(idxA - idxB) === cntA - 1)) continue;
      const ringB = water.rings[rB];
      const aB = ringB[idxB];
      const bB = ringB[(idxB + 1) % edgeCount[j]];
      if (segmentsTouch(aA, bA, aB, bB)) return false;
    }
  }
  return true;
}
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
const ringBoundsCache = new WeakMap<readonly RiverPoint[], Bounds>();

export function getRingBounds(ring: readonly RiverPoint[]): Bounds {
  let b = ringBoundsCache.get(ring);
  if (!b) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    b = { minX, minY, maxX, maxY };
    ringBoundsCache.set(ring, b);
  }
  return b;
}

/** Boundary is included, so dry footprints touching water fail conservatively. */
export function pointInWater(point: RiverPoint, water: PhysicalWaterPolygon): boolean {
  const grid = waterEdgeGrid(water);
  if (grid) return grid.pointInWater(point, water);
  let inside = false;
  for (const ring of water.rings) {
    const b = getRingBounds(ring);
    if (
      point[0] < b.minX - epsilon ||
      point[0] > b.maxX + epsilon ||
      point[1] < b.minY - epsilon ||
      point[1] > b.maxY + epsilon
    ) {
      continue;
    }
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i],
        c = ring[(i + 1) % n];
      const dx = c[0] - a[0],
        dy = c[1] - a[1];
      if (!dx && !dy) continue;
      // Most banks are remote from this point. Avoid allocating vectors and
      // measuring every edge for each provisional crossing candidate. The
      // padding includes both perpendicular and endpoint tolerances.
      if (
        point[0] >= Math.min(a[0], c[0]) - 2 * epsilon &&
        point[0] <= Math.max(a[0], c[0]) + 2 * epsilon &&
        point[1] >= Math.min(a[1], c[1]) - 2 * epsilon &&
        point[1] <= Math.max(a[1], c[1]) + 2 * epsilon
      ) {
        const x = point[0] - a[0],
          y = point[1] - a[1];
        const length = Math.hypot(dx, dy);
        const projection = (x * dx + y * dy) / length;
        if (Math.abs(dx * y - dy * x) / length <= epsilon && projection >= -epsilon && projection <= length + epsilon)
          return true;
      }
      if (a[1] > point[1] !== c[1] > point[1] && point[0] < a[0] + ((point[1] - a[1]) * (c[0] - a[0])) / (c[1] - a[1]))
        inside = !inside;
    }
  }
  return inside;
}
export function segmentsTouch(a: RiverPoint, b: RiverPoint, c: RiverPoint, d: RiverPoint): boolean {
  // Scalar sub/cross2 in the same operation order; called per edge pair, so no allocation.
  const abX = b[0] - a[0],
    abY = b[1] - a[1],
    cdX = d[0] - c[0],
    cdY = d[1] - c[1],
    offsetX = c[0] - a[0],
    offsetY = c[1] - a[1];
  const denominator = abX * cdY - abY * cdX;
  const abLength = Math.hypot(abX, abY),
    cdLength = Math.hypot(cdX, cdY);
  if (!abLength || !cdLength) return false;
  const offsetCrossAb = offsetX * abY - offsetY * abX;
  if (Math.abs(denominator) <= epsilon * abLength * cdLength) {
    if (Math.abs(offsetCrossAb) / abLength > epsilon) return false;
    const lo = (offsetX * abX + offsetY * abY) / abLength;
    const hi = lo + (cdX * abX + cdY * abY) / abLength;
    return Math.min(abLength, Math.max(lo, hi)) >= Math.max(0, Math.min(lo, hi)) - epsilon;
  }
  const t = (offsetX * cdY - offsetY * cdX) / denominator,
    u = offsetCrossAb / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
const waterBoundsCache = new WeakMap<PhysicalWaterPolygon, Bounds>();

export function getWaterBounds(water: PhysicalWaterPolygon): Bounds {
  let b = waterBoundsCache.get(water);
  if (!b) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < water.rings.length; i++) {
      const rb = getRingBounds(water.rings[i]);
      if (rb.minX < minX) minX = rb.minX;
      if (rb.maxX > maxX) maxX = rb.maxX;
      if (rb.minY < minY) minY = rb.minY;
      if (rb.maxY > maxY) maxY = rb.maxY;
    }
    b = { minX, minY, maxX, maxY };
    waterBoundsCache.set(water, b);
  }
  return b;
}

export function footprintTouchesWater(footprint: readonly RiverPoint[], water: PhysicalWaterPolygon): boolean {
  if (!footprint.length || !water.rings.length) return false;
  let fMinX = Infinity,
    fMinY = Infinity,
    fMaxX = -Infinity,
    fMaxY = -Infinity;
  for (let i = 0; i < footprint.length; i++) {
    const p = footprint[i];
    if (p[0] < fMinX) fMinX = p[0];
    if (p[0] > fMaxX) fMaxX = p[0];
    if (p[1] < fMinY) fMinY = p[1];
    if (p[1] > fMaxY) fMaxY = p[1];
  }

  // Quick reject against the entire water polygon bounds
  const wb = getWaterBounds(water);
  if (
    fMaxX < wb.minX - epsilon ||
    fMinX > wb.maxX + epsilon ||
    fMaxY < wb.minY - epsilon ||
    fMinY > wb.maxY + epsilon
  ) {
    return false;
  }

  if (footprint.some(p => pointInWater(p, water))) return true;
  const polygon: PhysicalWaterPolygon = { id: -1, rings: [footprint] };
  for (const ring of water.rings) {
    const b = getRingBounds(ring);
    if (fMaxX < b.minX - epsilon || fMinX > b.maxX + epsilon || fMaxY < b.minY - epsilon || fMinY > b.maxY + epsilon) {
      continue;
    }
    if (
      ring.some(
        p =>
          p[0] >= fMinX - epsilon &&
          p[0] <= fMaxX + epsilon &&
          p[1] >= fMinY - epsilon &&
          p[1] <= fMaxY + epsilon &&
          pointInWater(p, polygon)
      )
    )
      return true;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        c = ring[(i + 1) % ring.length];
      const eMinX = Math.min(a[0], c[0]),
        eMaxX = Math.max(a[0], c[0]),
        eMinY = Math.min(a[1], c[1]),
        eMaxY = Math.max(a[1], c[1]);
      if (fMaxX < eMinX - epsilon || fMinX > eMaxX + epsilon || fMaxY < eMinY - epsilon || fMinY > eMaxY + epsilon) {
        continue;
      }
      for (let j = 0; j < footprint.length; j++) {
        if (segmentsTouch(a, c, footprint[j], footprint[(j + 1) % footprint.length])) return true;
      }
    }
  }
  return false;
}
export interface NormalBankHit {
  distance: number;
  point: RiverPoint;
  ringIndex: number;
  edgeIndex: number;
  reference: RiverBankReference | null;
  bankArcLength: number | null;
}
/** Complete line intersections are used only to find q's immediate water interval.
 * Remote intersections are not a collision test for the finite bridge footprint.
 * Transverse joins with matching bank provenance are merged; tangencies, caps,
 * and unresolved vertex hits are rejected.
 */
export function normalWaterSection(
  q: RiverPoint,
  normal: RiverPoint,
  water: PhysicalWaterPolygon
): { negative: NormalBankHit; positive: NormalBankHit } | null {
  if (!pointInWater(q, water)) return null;
  const grid = waterEdgeGrid(water);
  if (grid)
    for (const radius of SECTION_WINDOW_METERS) {
      const windowed = windowedNormalSection(q, normal, water, grid, radius);
      if (windowed !== undefined) return windowed;
    }
  const hits = normalSectionHits(q, normal, water, null);
  return hits && mergeNormalSection(hits);
}

type SectionHit = NormalBankHit & { vertex?: boolean; transverseSign?: number };
/** Window half-sizes tried before the full scan, in metres. */
const SECTION_WINDOW_METERS = [256, 1024, 4096];
/** Hits within this distance of a window edge could merge with hits outside it. */
const SECTION_WINDOW_MARGIN_METERS = 2;

/**
 * Intersections of the normal line through q with the given edges (all edges when null),
 * visited in ring/edge order. Null when an edge runs along the line through q.
 */
function normalSectionHits(
  q: RiverPoint,
  normal: RiverPoint,
  water: PhysicalWaterPolygon,
  edges: readonly number[] | null
): SectionHit[] | null {
  const hits: SectionHit[] = [];
  const visit = (r: number, i: number): boolean => {
    const ring = water.rings[r];
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    // Scalar form of sub/cross2 with the same operation order: this loop visits
    // every bank edge for each crossing candidate, so it must not allocate.
    const edgeX = b[0] - a[0],
      edgeY = b[1] - a[1],
      offsetX = a[0] - q[0],
      offsetY = a[1] - q[1],
      length = Math.hypot(edgeX, edgeY);
    if (!length) return true;
    const denominator = normal[0] * edgeY - normal[1] * edgeX;
    const offsetCrossNormal = offsetX * normal[1] - offsetY * normal[0];
    if (Math.abs(denominator) <= epsilon * length) {
      if (Math.abs(offsetCrossNormal) <= epsilon) {
        const distances = [a, b].map(p => (p[0] - q[0]) * normal[0] + (p[1] - q[1]) * normal[1]);
        if (Math.min(...distances) <= epsilon && Math.max(...distances) >= -epsilon) return false;
        for (const distance of distances)
          hits.push({
            distance,
            point: [q[0] + distance * normal[0], q[1] + distance * normal[1]],
            ringIndex: r,
            edgeIndex: i,
            reference: null,
            bankArcLength: null
          });
      }
      return true;
    }
    const u = offsetCrossNormal / denominator;
    if (u < 0 || u > 1) return true;
    const distance = (offsetX * edgeY - offsetY * edgeX) / denominator;
    const reference = water.bankReferences?.[r]?.[i] ?? null;
    // Ambiguity at a remote vertex is irrelevant; retain it as an unresolved hit.
    const interior = u > epsilon && u < 1 - epsilon;
    hits.push({
      distance,
      point: [q[0] + distance * normal[0], q[1] + distance * normal[1]],
      ringIndex: r,
      edgeIndex: i,
      reference: reference ? { ...reference } : null,
      vertex: !interior,
      transverseSign: Math.sign(denominator),
      bankArcLength: reference ? reference.arcStart + u * (reference.arcEnd - reference.arcStart) : null
    });
    return true;
  };
  if (edges) {
    const grid = waterEdgeGrid(water)!;
    for (const k of edges) if (!visit(grid.edgeRing[k], grid.edgeIndex[k])) return null;
  } else
    for (let r = 0; r < water.rings.length; r++)
      for (let i = 0; i < water.rings[r].length; i++) if (!visit(r, i)) return null;
  return hits;
}

function mergeNormalSection(hits: SectionHit[]): { negative: NormalBankHit; positive: NormalBankHit } | null {
  hits.sort((a, b) => a.distance - b.distance);
  if (hits.some(h => Math.abs(h.distance) <= epsilon)) return null;
  const merged: NormalBankHit[] = [];
  for (let i = 0; i < hits.length; ) {
    const hit = hits[i];
    const group = [hit];
    while (++i < hits.length && Math.abs(hits[i].distance - hit.distance) <= epsilon) group.push(hits[i]);
    const compatible =
      group.length === 2 &&
      group.every(
        h =>
          h.vertex &&
          h.reference &&
          h.ringIndex === hit.ringIndex &&
          h.reference.side === hit.reference?.side &&
          h.transverseSign === hit.transverseSign &&
          h.bankArcLength !== null &&
          hit.bankArcLength !== null &&
          Math.abs(h.bankArcLength - hit.bankArcLength) <= epsilon
      );
    const resolved = (group.length === 1 && !hit.vertex) || compatible;
    merged.push({
      distance: hit.distance,
      point: hit.point,
      ringIndex: hit.ringIndex,
      edgeIndex: hit.edgeIndex,
      reference: resolved ? hit.reference : null,
      bankArcLength: resolved ? hit.bankArcLength : null
    });
  }
  const negative = merged.filter(h => h.distance < 0).at(-1),
    positive = merged.find(h => h.distance > 0);
  if (!negative || !positive) return null;
  return { negative, positive };
}

/**
 * The full-scan result computed from the edges near q, or undefined when the window
 * cannot prove it. An edge outside the square window can only meet the line farther
 * than `radius` from q, so every hit within it is found. When no hit lies in the outer
 * margin, the merge groups (each spanning at most epsilon) inside and outside never
 * join; and the nearest group on each side lies inside, so the answer is unchanged.
 */
function windowedNormalSection(
  q: RiverPoint,
  normal: RiverPoint,
  water: PhysicalWaterPolygon,
  grid: WaterEdgeGrid,
  radius: number
): { negative: NormalBankHit; positive: NormalBankHit } | null | undefined {
  const edges = grid.query(q[0] - radius, q[1] - radius, q[0] + radius, q[1] + radius);
  if (!edges) return undefined;
  const hits = normalSectionHits(q, normal, water, edges);
  if (!hits) return null;
  const inner = radius - SECTION_WINDOW_MARGIN_METERS;
  const near: SectionHit[] = [];
  let negative = false,
    positive = false;
  for (const hit of hits) {
    const distance = Math.abs(hit.distance);
    if (distance > radius) continue;
    if (distance > inner) return undefined;
    near.push(hit);
    if (hit.distance < 0) negative = true;
    else if (hit.distance > 0) positive = true;
  }
  if (!negative || !positive) return undefined;
  return mergeNormalSection(near);
}

/** Edge buckets of an immutable water polygon. Edge k is (edgeRing[k], edgeIndex[k]) in ring order. */
class WaterEdgeGrid {
  readonly edgeRing: number[] = [];
  readonly edgeIndex: number[] = [];
  private cells = new Map<number, number[]>();
  /** Edges by horizontal band, padded like pointInWater's boundary test. */
  private bands = new Map<number, number[]>();
  private ringBounds: Bounds[];
  private stamp: Int32Array;
  private generation = 0;
  constructor(
    water: PhysicalWaterPolygon,
    private size: number
  ) {
    this.ringBounds = water.rings.map(getRingBounds);
    for (let r = 0; r < water.rings.length; r++) {
      const ring = water.rings[r];
      for (let i = 0; i < ring.length; i++) {
        const k = this.edgeRing.length;
        this.edgeRing.push(r);
        this.edgeIndex.push(i);
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        const x0 = this.cell(Math.min(a[0], b[0])),
          x1 = this.cell(Math.max(a[0], b[0])),
          y0 = this.cell(Math.min(a[1], b[1])),
          y1 = this.cell(Math.max(a[1], b[1]));
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++) {
            const key = cellKey(x, y);
            const bucket = this.cells.get(key);
            if (bucket) bucket.push(k);
            else this.cells.set(key, [k]);
          }
        const b0 = this.band(Math.min(a[1], b[1]) - 2 * epsilon),
          b1 = this.band(Math.max(a[1], b[1]) + 2 * epsilon);
        for (let band = b0; band <= b1; band++) {
          const bucket = this.bands.get(band);
          if (bucket) bucket.push(k);
          else this.bands.set(band, [k]);
        }
      }
    }
    this.stamp = new Int32Array(this.edgeRing.length);
  }
  private cell(value: number): number {
    return Math.floor(value / this.size);
  }
  private band(y: number): number {
    return Math.floor(y / EDGE_BAND_METERS);
  }
  /**
   * pointInWater over the edges whose padded y-span contains the point; others can
   * neither touch it nor cross its ray. Boundary contact and crossing parity do not
   * depend on edge order, so the result equals the full scan.
   */
  pointInWater(point: RiverPoint, water: PhysicalWaterPolygon): boolean {
    let inside = false;
    for (const k of this.bands.get(this.band(point[1])) ?? []) {
      const b = this.ringBounds[this.edgeRing[k]];
      if (
        point[0] < b.minX - epsilon ||
        point[0] > b.maxX + epsilon ||
        point[1] < b.minY - epsilon ||
        point[1] > b.maxY + epsilon
      )
        continue;
      const ring = water.rings[this.edgeRing[k]];
      const n = ring.length,
        i = this.edgeIndex[k];
      const a = ring[i],
        c = ring[(i + 1) % n];
      const dx = c[0] - a[0],
        dy = c[1] - a[1];
      if (!dx && !dy) continue;
      if (
        point[0] >= Math.min(a[0], c[0]) - 2 * epsilon &&
        point[0] <= Math.max(a[0], c[0]) + 2 * epsilon &&
        point[1] >= Math.min(a[1], c[1]) - 2 * epsilon &&
        point[1] <= Math.max(a[1], c[1]) + 2 * epsilon
      ) {
        const x = point[0] - a[0],
          y = point[1] - a[1];
        const length = Math.hypot(dx, dy);
        const projection = (x * dx + y * dy) / length;
        if (Math.abs(dx * y - dy * x) / length <= epsilon && projection >= -epsilon && projection <= length + epsilon)
          return true;
      }
      if (a[1] > point[1] !== c[1] > point[1] && point[0] < a[0] + ((point[1] - a[1]) * (c[0] - a[0])) / (c[1] - a[1]))
        inside = !inside;
    }
    return inside;
  }
  /** Edges whose bounds may touch the box, in ring order; null when the box spans too many cells. */
  query(minX: number, minY: number, maxX: number, maxY: number): number[] | null {
    const x0 = this.cell(minX) - 1,
      x1 = this.cell(maxX) + 1,
      y0 = this.cell(minY) - 1,
      y1 = this.cell(maxY) + 1;
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return null;
    const generation = ++this.generation;
    const found: number[] = [];
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const bucket = this.cells.get(cellKey(x, y));
        if (!bucket) continue;
        for (const k of bucket)
          if (this.stamp[k] !== generation) {
            this.stamp[k] = generation;
            found.push(k);
          }
      }
    return found.sort((a, b) => a - b);
  }
}
const cellKey = (x: number, y: number) => (x + 1048576) * 2097152 + (y + 1048576);
const EDGE_GRID_METERS = 64;
const EDGE_BAND_METERS = 16;
const edgeGridCache = new WeakMap<PhysicalWaterPolygon, WaterEdgeGrid | null>();

/** Only frozen snapshots are indexed, so a cached index can never describe changed rings. */
function waterEdgeGrid(water: PhysicalWaterPolygon): WaterEdgeGrid | null {
  const cached = edgeGridCache.get(water);
  if (cached !== undefined) return cached;
  const frozen =
    Object.isFrozen(water) &&
    Object.isFrozen(water.rings) &&
    water.rings.every(ring => Object.isFrozen(ring) && ring.every(Object.isFrozen));
  const grid = frozen ? new WaterEdgeGrid(water, EDGE_GRID_METERS) : null;
  if (frozen) edgeGridCache.set(water, grid);
  return grid;
}
