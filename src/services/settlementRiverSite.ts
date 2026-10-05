import type { WorldContext } from "../context/worldContext";
import type { River } from "../types/models";
import { indexedPhysicalWater } from "./indexedPhysicalWater";
import { evaluateRiverAxis } from "./riverAxisSampling";
import type { RiverPoint } from "./riverGeometry";
import { type PhysicalRiverGeometry, pointInWater } from "./riverPhysicalGeometry";
import { SpatialBoundsIndex } from "./spatialBoundsIndex";
import {
  WorldRiverGeometryRegistry,
  type WorldRiverGeometrySettings,
  worldRiverOccupiedBounds
} from "./worldRiverGeometry";

/** Shared, bounded survey for settlement placement and its CE export. */
export const SETTLEMENT_RIVER_SETTINGS: WorldRiverGeometrySettings = Object.freeze({
  curveAlpha: 0.1,
  precision: Object.freeze({ arcToleranceMeters: 0.01, maxIntegrationDepth: 20, maxEvaluations: 100000 }),
  banks: Object.freeze({ maxStepMeters: 2000, maxChordErrorMeters: 0.5, maxSamples: 2000, allowDrySource: true }),
  maxSourcePoints: 5000
});
const registry = new WorldRiverGeometryRegistry();
export function settlementRiverGeometry(world: Readonly<WorldContext>, river: River, unit: string) {
  const result = registry.get(world, river, unit, SETTLEMENT_RIVER_SETTINGS);
  return "geometry" in result
    ? result
    : { ...result, bounds: worldRiverOccupiedBounds(world, river, unit, SETTLEMENT_RIVER_SETTINGS) };
}
export interface RiverSettlementSite {
  point: RiverPoint;
  bankPoint: RiverPoint;
  bank: "left" | "right";
  arcLengthMeters: number;
  geometryVersion: number;
  sourceSegmentId?: number;
  sourceParameter?: number;
  widthMeters: number;
  bankDistanceMeters: number;
  footprint: RiverPoint[];
  access: RiverPoint[];
  accessFootprint: RiverPoint[];
}

type BankEdge = {
  a: RiverPoint;
  b: RiverPoint;
  ref: NonNullable<NonNullable<PhysicalRiverGeometry["water"]["bankReferences"]>[number][number]>;
  outward: number;
};
const bankIndices = new WeakMap<object, SpatialBoundsIndex<BankEdge>>();
function settlementBankEdges(geometry: PhysicalRiverGeometry) {
  const water = geometry.water;
  const cached = bankIndices.get(water);
  if (cached) return cached;
  const edges: BankEdge[] = [];
  for (let j = 0; j < water.rings.length; j++) {
    const ring = water.rings[j];
    const signedArea = ring.reduce((sum, a, i) => {
      const b = ring[(i + 1) % ring.length];
      return sum + (a[0] - ring[0][0]) * (b[1] - ring[0][1]) - (b[0] - ring[0][0]) * (a[1] - ring[0][1]);
    }, 0);
    for (let i = 0; i < ring.length; i++) {
      const ref = water.bankReferences?.[j]?.[i];
      if (ref) edges.push({ a: ring[i], b: ring[(i + 1) % ring.length], ref, outward: signedArea < 0 ? 1 : -1 });
    }
  }
  const index = new SpatialBoundsIndex(edges, ({ a, b }) => ({
    minX: Math.min(a[0], b[0]),
    maxX: Math.max(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxY: Math.max(a[1], b[1])
  }));
  // Mutable callers get a fresh index; generated regional water is immutable.
  if (Object.isFrozen(water) && water.rings.every(ring => Object.isFrozen(ring) && ring.every(Object.isFrozen)))
    bankIndices.set(water, index);
  return index;
}

/** A square urban reservation on the dry side of an actual polygon edge.
 * Validate the entire reservation and the short water-access path, not just its centre.
 * No cap, unsupported bank, or remote reach is used as a substitute shoreline. */
export function findRiverSettlementSite(input: {
  geometry: PhysicalRiverGeometry;
  origin: RiverPoint;
  radiusMeters: number;
  bankGapMeters: number;
  accessWidthMeters: number;
  maxMoveMeters: number;
  maxCandidates: number;
  otherWater: readonly { id: number; rings: readonly (readonly RiverPoint[])[] }[];
  supports: (footprint: readonly RiverPoint[], access: readonly RiverPoint[], point: RiverPoint) => boolean;
}): { site: RiverSettlementSite } | { reason: "invalid-settings" | "no-dry-site" | "candidate-budget" } {
  const steps = findRiverSettlementSiteSteps(input);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}
export function* findRiverSettlementSiteSteps(
  input: Parameters<typeof findRiverSettlementSite>[0]
): Generator<void, ReturnType<typeof findRiverSettlementSite>> {
  const { geometry, origin, radiusMeters: r, bankGapMeters: gap } = input;
  if (
    !origin.every(Number.isFinite) ||
    ![r, gap, input.maxMoveMeters, input.accessWidthMeters].every(n => Number.isFinite(n) && n > 0) ||
    !Number.isSafeInteger(input.maxCandidates) ||
    input.maxCandidates < 1
  )
    return { reason: "invalid-settings" };
  const waters = [geometry.water, ...input.otherWater].map(indexedPhysicalWater);
  const candidates: { site: RiverSettlementSite; distance: number; order: number }[] = [];
  const reach = input.maxMoveMeters + r + gap;
  const edges = settlementBankEdges(geometry).nearest(
    {
      minX: origin[0] - reach,
      maxX: origin[0] + reach,
      minY: origin[1] - reach,
      maxY: origin[1] + reach
    },
    origin
  );
  let candidateCount = 0;
  let edgeNumber = 0;
  for (const { value: edge, distance: lowerBound, order } of edges) {
    if (edgeNumber++ % 128 === 0) yield;
    if (candidateCount > input.maxCandidates && lowerBound - r - gap > candidates.at(-1)!.distance) break;
    const { a, b, ref, outward } = edge;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    if (!length) continue;
    const t = Math.max(0, Math.min(1, ((origin[0] - a[0]) * dx + (origin[1] - a[1]) * dy) / (length * length)));
    const bankPoint: RiverPoint = [a[0] + t * dx, a[1] + t * dy];
    // Reject remote bank segments before analytic arc inversion and polygon tests.
    if (Math.hypot(bankPoint[0] - origin[0], bankPoint[1] - origin[1]) > input.maxMoveMeters + r + gap) continue;
    const arc = ref.arcStart + t * (ref.arcEnd - ref.arcStart);
    const along: RiverPoint = [dx / length, dy / length];
    // Ring orientation determines the outward edge normal without a full point-in-water scan.
    const normal: RiverPoint = [-along[1] * outward, along[0] * outward];
    const point: RiverPoint = [bankPoint[0] + normal[0] * (r + gap), bankPoint[1] + normal[1] * (r + gap)];
    const distance = Math.hypot(point[0] - origin[0], point[1] - origin[1]);
    if (distance > input.maxMoveMeters) continue;
    const footprint: RiverPoint[] = [
      [-r, -r],
      [r, -r],
      [r, r],
      [-r, r]
    ].map(([u, v]) => [point[0] + along[0] * u + normal[0] * v, point[1] + along[1] * u + normal[1] * v]);
    const halfAccess = input.accessWidthMeters / 2;
    const landingGap = Math.min(gap, halfAccess + 1);
    const accessEnd: RiverPoint = [bankPoint[0] + normal[0] * landingGap, bankPoint[1] + normal[1] * landingGap];
    const access: RiverPoint[] = [point, accessEnd];
    const accessFootprint: RiverPoint[] = [
      [r + gap + halfAccess, -halfAccess],
      [r + gap + halfAccess, halfAccess],
      [landingGap - halfAccess, halfAccess],
      [landingGap - halfAccess, -halfAccess]
    ].map(([distance, side]) => [
      bankPoint[0] + normal[0] * distance + along[0] * side,
      bankPoint[1] + normal[1] * distance + along[1] * side
    ]);
    const candidate = {
      distance,
      order,
      site: {
        point,
        bankPoint,
        bank: ref.side,
        arcLengthMeters: arc,
        geometryVersion: geometry.axis.geometryVersion,
        widthMeters: 0,
        bankDistanceMeters: r + gap,
        footprint,
        access,
        accessFootprint
      }
    };
    candidateCount++;
    // Keep the original stable distance/arc ordering while retaining only the
    // bounded prefix that can actually be tested. Never truncate coarse edges.
    let lo = 0,
      hi = candidates.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1,
        other = candidates[mid];
      const comparison =
        candidate.distance - other.distance ||
        candidate.site.arcLengthMeters - other.site.arcLengthMeters ||
        candidate.order - other.order;
      if (comparison < 0) hi = mid;
      else lo = mid + 1;
    }
    if (lo < input.maxCandidates) {
      candidates.splice(lo, 0, candidate);
      if (candidates.length > input.maxCandidates) candidates.pop();
    }
  }
  for (const { site } of candidates.slice(0, input.maxCandidates)) {
    yield;
    if (waters.some(w => w.touches(site.footprint) || w.touches(site.accessFootprint))) continue;
    if (
      !input.supports(site.footprint, site.access, site.point) ||
      !input.supports(site.accessFootprint, site.access, site.point)
    )
      continue;
    const sample = evaluateRiverAxis(geometry.axis, site.arcLengthMeters);
    if (!sample) continue;
    site.sourceSegmentId = sample.segmentIndex;
    if ("parameter" in sample && typeof sample.parameter === "number") site.sourceParameter = sample.parameter;
    site.widthMeters = 2 * Math.hypot(site.bankPoint[0] - sample.point[0], site.bankPoint[1] - sample.point[1]);
    return { site };
  }
  return { reason: candidateCount > input.maxCandidates ? "candidate-budget" : "no-dry-site" };
}

export function settlementRadiusMeters(population: number): number {
  return Math.max(80, Math.min(1500, Math.round(Math.sqrt(((Math.max(population, 50) / 150) * 10000) / Math.PI))));
}

/** Nearest provenance-bearing shoreline, in world metres. */
export function nearestSettlementBank(geometry: PhysicalRiverGeometry, origin: RiverPoint) {
  let nearest: { bankPoint: RiverPoint; waterPoint: RiverPoint; distance: number } | null = null;
  for (let j = 0; j < geometry.water.rings.length; j++) {
    const ring = geometry.water.rings[j];
    for (let i = 0; i < ring.length; i++) {
      const ref = geometry.water.bankReferences?.[j]?.[i];
      if (!ref) continue;
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        length2 = dx * dx + dy * dy;
      if (!length2) continue;
      const t = Math.max(0, Math.min(1, ((origin[0] - a[0]) * dx + (origin[1] - a[1]) * dy) / length2));
      const bankPoint: RiverPoint = [a[0] + dx * t, a[1] + dy * t];
      const distance = Math.hypot(bankPoint[0] - origin[0], bankPoint[1] - origin[1]);
      if (nearest && nearest.distance <= distance) continue;
      const sample = evaluateRiverAxis(geometry.axis, ref.arcStart + t * (ref.arcEnd - ref.arcStart));
      if (!sample) continue;
      const span = Math.hypot(sample.point[0] - bankPoint[0], sample.point[1] - bankPoint[1]);
      if (!span) continue;
      const ratio = Math.min(50, span) / span;
      const waterPoint: RiverPoint = [
        bankPoint[0] + (sample.point[0] - bankPoint[0]) * ratio,
        bankPoint[1] + (sample.point[1] - bankPoint[1]) * ratio
      ];
      if (pointInWater(waterPoint, geometry.water)) nearest = { bankPoint, waterPoint, distance };
    }
  }
  return nearest;
}

/** Exact coverage by the packed graph's convex, disjoint land cells.
 * Corner tests alone miss a missing cell or an unsupported hole inside a city. */
export function coveredByTerrainCells(
  footprint: readonly RiverPoint[],
  rings: readonly (readonly RiverPoint[])[]
): boolean {
  const area = (polygon: readonly RiverPoint[]) => {
    if (polygon.length < 3) return 0;
    const origin = polygon[0];
    return (
      polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        return sum + (p[0] - origin[0]) * (q[1] - origin[1]) - (p[1] - origin[1]) * (q[0] - origin[0]);
      }, 0) / 2
    );
  };
  const wanted = Math.abs(area(footprint));
  if (!Number.isFinite(wanted) || wanted <= 0) return false;
  let covered = 0;
  for (const ring of rings) {
    const signed = area(ring);
    if (!Number.isFinite(signed) || signed === 0) continue;
    const sign = Math.sign(signed);
    let clipped: RiverPoint[] = [...footprint];
    for (let i = 0; i < ring.length && clipped.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const side = (p: RiverPoint) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
      const next: RiverPoint[] = [];
      for (let j = 0; j < clipped.length; j++) {
        const p = clipped[j],
          q = clipped[(j + 1) % clipped.length];
        const dp = side(p),
          dq = side(q);
        if (dp >= 0) next.push(p);
        if (dp >= 0 !== dq >= 0) {
          const t = dp / (dp - dq);
          next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
      }
      clipped = next;
    }
    covered += Math.abs(area(clipped));
  }
  return Number.isFinite(covered) && covered >= wanted - Math.max(1e-6, wanted * 1e-9);
}
