import { RIVER_GEOMETRY_TOLERANCE as epsilon, type RiverPoint } from "./riverGeometry";
import { type PhysicalWaterPolygon, pointInWater, segmentsTouch } from "./riverPhysicalGeometry";
import { type SpatialBounds, SpatialBoundsIndex } from "./spatialBoundsIndex";

const boundsOf = (points: readonly RiverPoint[], padding = 0): SpatialBounds => {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const p of points) {
    b.minX = Math.min(b.minX, p[0]);
    b.maxX = Math.max(b.maxX, p[0]);
    b.minY = Math.min(b.minY, p[1]);
    b.maxY = Math.max(b.maxY, p[1]);
  }
  return { minX: b.minX - padding, maxX: b.maxX + padding, minY: b.minY - padding, maxY: b.maxY + padding };
};
interface Edge {
  a: RiverPoint;
  b: RiverPoint;
  dx: number;
  dy: number;
  length: number;
}
/** Index over an owned snapshot; containment and boundary contact retain even/odd ring semantics. */
export class IndexedPhysicalWater {
  private edges: SpatialBoundsIndex<Edge>;
  private vertices: SpatialBoundsIndex<RiverPoint>;
  private bounds: SpatialBounds;
  constructor(water: PhysicalWaterPolygon) {
    const rings = water.rings.map(r => r.map(p => [p[0], p[1]] as RiverPoint));
    const points = rings.flat();
    this.bounds = boundsOf(points);
    this.vertices = new SpatialBoundsIndex(points, p => boundsOf([p]));
    this.edges = new SpatialBoundsIndex(
      rings.flatMap(r =>
        r.map((a, i) => {
          const b = r[(i + 1) % r.length];
          return { a, b, dx: b[0] - a[0], dy: b[1] - a[1], length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
        })
      ),
      e => boundsOf([e.a, e.b], epsilon)
    );
  }
  get spatialBounds() {
    return this.bounds;
  }
  get visitedEdges() {
    return this.edges.visitedEntries;
  }
  contains(p: RiverPoint): boolean {
    let inside = false;
    for (const e of this.edges.query({
      minX: p[0] - epsilon,
      maxX: Math.max(p[0], this.bounds.maxX) + epsilon,
      minY: p[1] - epsilon,
      maxY: p[1] + epsilon
    })) {
      if (!e.length) continue;
      const x = p[0] - e.a[0],
        y = p[1] - e.a[1];
      const projection = (x * e.dx + y * e.dy) / e.length;
      if (
        Math.abs(e.dx * y - e.dy * x) / e.length <= epsilon &&
        projection >= -epsilon &&
        projection <= e.length + epsilon
      )
        return true;
      if (e.a[1] > p[1] !== e.b[1] > p[1] && p[0] < e.a[0] + ((p[1] - e.a[1]) * e.dx) / e.dy) inside = !inside;
    }
    return inside;
  }
  touches(footprint: readonly RiverPoint[]): boolean {
    if (!footprint.length || footprint.some(p => !p.every(Number.isFinite))) return true;
    if (footprint.some(p => this.contains(p))) return true;
    const b = boundsOf(footprint, epsilon);
    const polygon = { id: -1, rings: [footprint] };
    if (this.vertices.query(b).some(p => pointInWater(p, polygon))) return true;
    for (const edge of this.edges.query(b))
      for (let i = 0; i < footprint.length; i++) {
        if (segmentsTouch(edge.a, edge.b, footprint[i], footprint[(i + 1) % footprint.length])) return true;
      }
    return false;
  }
}
const cache = new WeakMap<PhysicalWaterPolygon, IndexedPhysicalWater>();
export function indexedPhysicalWater(water: PhysicalWaterPolygon): IndexedPhysicalWater {
  const existing = cache.get(water);
  if (existing) return existing;
  // Legacy mutable input is never retained across calls without a revision/fingerprint.
  if (!Object.isFrozen(water) || !water.rings.every(r => Object.isFrozen(r) && r.every(Object.isFrozen)))
    return new IndexedPhysicalWater(water);
  let index = cache.get(water);
  if (!index) {
    index = new IndexedPhysicalWater(water);
    cache.set(water, index);
  }
  return index;
}

/** A verified union of disjoint-interior patches shares each patch's edge index. */
class PartitionedPhysicalWater extends IndexedPhysicalWater {
  private parts: SpatialBoundsIndex<IndexedPhysicalWater>;
  constructor(private children: IndexedPhysicalWater[]) {
    super({ id: -1, rings: [] });
    this.parts = new SpatialBoundsIndex(children, child => child.spatialBounds);
  }
  override get visitedEdges() {
    return this.children.reduce((n, child) => n + child.visitedEdges, 0);
  }
  override contains(point: RiverPoint) {
    return this.parts
      .query({ minX: point[0] - epsilon, maxX: point[0] + epsilon, minY: point[1] - epsilon, maxY: point[1] + epsilon })
      .some(child => child.contains(point));
  }
  override touches(footprint: readonly RiverPoint[]) {
    return this.parts.query(boundsOf(footprint, epsilon)).some(child => child.touches(footprint));
  }
}
export function registerPhysicalWaterPartitions(
  water: PhysicalWaterPolygon,
  partitions: readonly PhysicalWaterPolygon[]
): void {
  if (!Object.isFrozen(water) || !water.rings.every(r => Object.isFrozen(r) && r.every(Object.isFrozen)))
    throw new TypeError("Partitioned water must be immutable");
  cache.set(water, new PartitionedPhysicalWater(partitions.map(indexedPhysicalWater)));
}
