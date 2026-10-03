import { RIVER_GEOMETRY_TOLERANCE, type RiverPoint } from "./riverGeometry";
import { footprintTouchesWater, type PhysicalWaterPolygon, validWaterPolygon } from "./riverPhysicalGeometry";

export interface WaterBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export function footprintBounds(points: readonly RiverPoint[]): WaterBounds | null {
  if (!points.length || points.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    bounds.minX = Math.min(bounds.minX, p[0]);
    bounds.maxX = Math.max(bounds.maxX, p[0]);
    bounds.minY = Math.min(bounds.minY, p[1]);
    bounds.maxY = Math.max(bounds.maxY, p[1]);
  }
  return bounds;
}
function overlaps(a: WaterBounds, b: WaterBounds): boolean {
  const e = RIVER_GEOMETRY_TOLERANCE;
  return a.minX <= b.maxX + e && a.maxX >= b.minX - e && a.minY <= b.maxY + e && a.maxY >= b.minY - e;
}
function signature(water: PhysicalWaterPolygon): string {
  return JSON.stringify(water);
}
function deeplyFrozen(water: PhysicalWaterPolygon): boolean {
  return (
    Object.isFrozen(water) &&
    Object.isFrozen(water.rings) &&
    water.rings.every(r => Object.isFrozen(r) && r.every(Object.isFrozen)) &&
    (!water.bankReferences ||
      (Object.isFrozen(water.bankReferences) &&
        water.bankReferences.every(r => Object.isFrozen(r) && r.every(v => v === null || Object.isFrozen(v)))))
  );
}
interface WaterSnapshot {
  source: PhysicalWaterPolygon;
  water: PhysicalWaterPolygon;
  bounds: WaterBounds;
  signature: string;
  immutableSource: boolean;
}
/** Mutable inputs are fingerprinted on reuse; owned snapshots are deeply frozen.
 * A failed input is also cached, but repair invalidates that cached failure.
 */
export class PhysicalWaterValidationCache {
  private entries = new WeakMap<object, { signature: string; immutable: boolean; snapshot: WaterSnapshot | null }>();
  private validations = 0;
  private hits = 0;
  get stats() {
    return { validations: this.validations, cacheHits: this.hits };
  }
  get(source: PhysicalWaterPolygon): WaterSnapshot | null {
    const previous = this.entries.get(source);
    const key = previous?.immutable ? previous.signature : signature(source);
    if (previous?.signature === key) {
      this.hits++;
      return previous.snapshot;
    }
    this.validations++;
    const immutable = deeplyFrozen(source);
    let snapshot: WaterSnapshot | null = null;
    if (validWaterPolygon(source)) {
      const rings = source.rings.map(r => Object.freeze(r.map(p => Object.freeze([p[0], p[1]] as [number, number]))));
      const bankReferences = source.bankReferences?.map(r =>
        Object.freeze(r.map(ref => (ref ? Object.freeze({ ...ref }) : null)))
      );
      const water = Object.freeze({
        id: source.id,
        rings: Object.freeze(rings),
        ...(bankReferences ? { bankReferences: Object.freeze(bankReferences) } : {})
      });
      const bounds = footprintBounds(rings.flat())!;
      snapshot = Object.freeze({
        source,
        water,
        bounds: Object.freeze(bounds),
        signature: key,
        immutableSource: immutable
      });
    }
    this.entries.set(source, { signature: key, immutable, snapshot });
    return snapshot;
  }
}
interface Entry {
  snapshot: WaterSnapshot;
  order: number;
}
interface Node {
  bounds: WaterBounds;
  entries?: readonly Entry[];
  left?: Node;
  right?: Node;
}
function buildNode(entries: Entry[]): Node {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const {
    snapshot: { bounds: b }
  } of entries) {
    bounds.minX = Math.min(bounds.minX, b.minX);
    bounds.maxX = Math.max(bounds.maxX, b.maxX);
    bounds.minY = Math.min(bounds.minY, b.minY);
    bounds.maxY = Math.max(bounds.maxY, b.maxY);
  }
  if (entries.length <= 4) return { bounds, entries };
  const dimension = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY ? "X" : "Y";
  entries.sort(
    (a, b) =>
      a.snapshot.bounds[`min${dimension}`] / 2 +
        a.snapshot.bounds[`max${dimension}`] / 2 -
        (b.snapshot.bounds[`min${dimension}`] / 2 + b.snapshot.bounds[`max${dimension}`] / 2) || a.order - b.order
  );
  const middle = Math.floor(entries.length / 2);
  return { bounds, left: buildNode(entries.slice(0, middle)), right: buildNode(entries.slice(middle)) };
}
/** Static BVH over validated physical water snapshots. Query results retain source
 * order, independent of tree shape. IDs need not be unique across river/lake namespaces.
 */
export class PhysicalWaterIndex {
  private root: Node | null;
  private sources = new Map<PhysicalWaterPolygon, WaterSnapshot>();
  private queryCount = 0;
  private visitedNodes = 0;
  private polygonTests = 0;
  private boundsTests = 0;
  private constructor(private snapshots: readonly WaterSnapshot[]) {
    this.root = snapshots.length ? buildNode(snapshots.map((snapshot, order) => ({ snapshot, order }))) : null;
    for (const snapshot of snapshots) {
      this.sources.set(snapshot.source, snapshot);
      this.sources.set(snapshot.water, snapshot);
    }
  }
  static build(
    waters: readonly PhysicalWaterPolygon[],
    cache: PhysicalWaterValidationCache,
    previous?: PhysicalWaterIndex
  ): PhysicalWaterIndex | null {
    const snapshots: WaterSnapshot[] = [];
    for (const water of waters) {
      const snapshot = cache.get(water);
      if (!snapshot) return null;
      snapshots.push(snapshot);
    }
    if (
      previous &&
      snapshots.length === previous.snapshots.length &&
      snapshots.every((s, i) => s === previous.snapshots[i])
    )
      return previous;
    return new PhysicalWaterIndex(snapshots);
  }
  get stats() {
    return {
      queries: this.queryCount,
      visitedNodes: this.visitedNodes,
      polygonTests: this.polygonTests,
      boundsTests: this.boundsTests
    };
  }
  /** Reject stale mutable target input instead of mixing it with an older snapshot. */
  getSnapshot(source: PhysicalWaterPolygon): PhysicalWaterPolygon | null {
    const snapshot = this.sources.get(source);
    if (
      !snapshot ||
      (source !== snapshot.water && !snapshot.immutableSource && signature(source) !== snapshot.signature)
    )
      return null;
    return snapshot.water;
  }
  query(bounds: WaterBounds, exclude?: PhysicalWaterPolygon): readonly PhysicalWaterPolygon[] {
    if (!Object.values(bounds).every(Number.isFinite) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY)
      throw new RangeError("Invalid water query bounds");
    this.queryCount++;
    const excluded = exclude ? this.sources.get(exclude) : undefined;
    const found: Entry[] = [];
    const visit = (node: Node) => {
      this.visitedNodes++;
      if (!overlaps(node.bounds, bounds)) return;
      if (node.entries)
        for (const entry of node.entries) {
          if (entry.snapshot === excluded) continue;
          this.boundsTests++;
          if (overlaps(entry.snapshot.bounds, bounds)) found.push(entry);
        }
      else {
        if (node.left) visit(node.left);
        if (node.right) visit(node.right);
      }
    };
    if (this.root) visit(this.root);
    found.sort((a, b) => a.order - b.order);
    return found.map(e => e.snapshot.water);
  }
  /** Invalid footprints are never classified as dry. */
  touchesWater(footprint: readonly RiverPoint[], exclude?: PhysicalWaterPolygon): boolean {
    const bounds = footprintBounds(footprint);
    if (!bounds || !validWaterPolygon({ id: -1, rings: [footprint] })) return true;
    return this.query(bounds, exclude).some(w => {
      this.polygonTests++;
      return footprintTouchesWater(footprint, w);
    });
  }
}
