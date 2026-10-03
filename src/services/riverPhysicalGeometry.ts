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
const sub = (a: RiverPoint, b: RiverPoint): RiverPoint => [a[0] - b[0], a[1] - b[1]];
const epsilon = RIVER_GEOMETRY_TOLERANCE;

/** Conservative input validation; callers should cache validated geometry by version.
 * Self-intersections and touching rings do not provide an unambiguous water interior.
 */
export function validWaterPolygon(water: PhysicalWaterPolygon): boolean {
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
      if (Math.hypot(...sub(b, a)) <= epsilon) return false;
      area += cross2(sub(a, ring[0]), sub(b, ring[0]));
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
      for (let j = i + 1; j < ring.length; j++) {
        if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
        if (segmentsTouch(a, b, ring[j], ring[(j + 1) % ring.length])) return false;
      }
      for (let prior = 0; prior < r; prior++) {
        const other = water.rings[prior];
        for (let j = 0; j < other.length; j++) {
          if (segmentsTouch(a, b, other[j], other[(j + 1) % other.length])) return false;
        }
      }
    }
    if (Math.abs(area) <= epsilon * epsilon) return false;
  }
  return true;
}
/** Boundary is included, so dry footprints touching water fail conservatively. */
export function pointInWater(point: RiverPoint, water: PhysicalWaterPolygon): boolean {
  let inside = false;
  for (const ring of water.rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const edge = sub(b, a),
        delta = sub(point, a),
        length = Math.hypot(...edge);
      if (length === 0) continue;
      const projection = (delta[0] * edge[0] + delta[1] * edge[1]) / length;
      if (Math.abs(cross2(edge, delta)) / length <= epsilon && projection >= -epsilon && projection <= length + epsilon)
        return true;
      if (a[1] > point[1] !== b[1] > point[1] && point[0] < a[0] + ((point[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
        inside = !inside;
    }
  }
  return inside;
}
function segmentsTouch(a: RiverPoint, b: RiverPoint, c: RiverPoint, d: RiverPoint): boolean {
  const ab = sub(b, a),
    cd = sub(d, c),
    offset = sub(c, a);
  const denominator = cross2(ab, cd);
  const abLength = Math.hypot(...ab),
    cdLength = Math.hypot(...cd);
  if (!abLength || !cdLength) return false;
  if (Math.abs(denominator) <= epsilon * abLength * cdLength) {
    if (Math.abs(cross2(offset, ab)) / abLength > epsilon) return false;
    const lo = (offset[0] * ab[0] + offset[1] * ab[1]) / abLength;
    const hi = lo + (cd[0] * ab[0] + cd[1] * ab[1]) / abLength;
    return Math.min(abLength, Math.max(lo, hi)) >= Math.max(0, Math.min(lo, hi)) - epsilon;
  }
  const t = cross2(offset, cd) / denominator,
    u = cross2(offset, ab) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
export function footprintTouchesWater(footprint: readonly RiverPoint[], water: PhysicalWaterPolygon): boolean {
  if (footprint.some(p => pointInWater(p, water))) return true;
  const polygon: PhysicalWaterPolygon = { id: -1, rings: [footprint] };
  for (const ring of water.rings) {
    if (ring.some(p => pointInWater(p, polygon))) return true;
    for (let i = 0; i < ring.length; i++)
      for (let j = 0; j < footprint.length; j++) {
        if (segmentsTouch(ring[i], ring[(i + 1) % ring.length], footprint[j], footprint[(j + 1) % footprint.length]))
          return true;
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
  const hits: (NormalBankHit & { vertex?: boolean; transverseSign?: number })[] = [];
  for (let r = 0; r < water.rings.length; r++) {
    const ring = water.rings[r];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const edge = sub(b, a),
        offset = sub(a, q),
        length = Math.hypot(...edge);
      if (!length) continue;
      const denominator = cross2(normal, edge);
      if (Math.abs(denominator) <= epsilon * length) {
        if (Math.abs(cross2(offset, normal)) <= epsilon) {
          const distances = [a, b].map(p => (p[0] - q[0]) * normal[0] + (p[1] - q[1]) * normal[1]);
          if (Math.min(...distances) <= epsilon && Math.max(...distances) >= -epsilon) return null;
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
        continue;
      }
      const u = cross2(offset, normal) / denominator;
      if (u < 0 || u > 1) continue;
      const distance = cross2(offset, edge) / denominator;
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
    }
  }
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
