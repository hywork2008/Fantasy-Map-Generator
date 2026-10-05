export interface SpatialBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
const overlaps = (a: SpatialBounds, b: SpatialBounds) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
interface Entry<T> {
  bounds: SpatialBounds;
  value: T;
  order: number;
  rank: number;
}
interface Node<T> {
  bounds: SpatialBounds;
  entries?: Entry<T>[];
  left?: Node<T>;
  right?: Node<T>;
}
const union = (a: SpatialBounds, b: SpatialBounds): SpatialBounds => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY)
});
function spread16(value: number) {
  let v = value & 65535;
  v = (v | (v << 8)) & 0x00ff00ff;
  v = (v | (v << 4)) & 0x0f0f0f0f;
  v = (v | (v << 2)) & 0x33333333;
  return (v | (v << 1)) & 0x55555555;
}
/** Static Morton-ordered BVH. Exact bounds filter all candidates; ranking affects only tree shape. */
export class SpatialBoundsIndex<T> {
  private root?: Node<T>;
  visitedEntries = 0;
  constructor(values: readonly T[], bounds: (value: T) => SpatialBounds) {
    if (!values.length) return;
    const entries = values.map((value, order) => ({ value, order, bounds: bounds(value), rank: 0 }));
    let extent = entries[0].bounds;
    for (const entry of entries) extent = union(extent, entry.bounds);
    const width = extent.maxX - extent.minX,
      height = extent.maxY - extent.minY;
    for (const entry of entries) {
      const x =
        width > 0 ? Math.floor(((entry.bounds.minX / 2 + entry.bounds.maxX / 2 - extent.minX) / width) * 65535) : 0;
      const y =
        height > 0 ? Math.floor(((entry.bounds.minY / 2 + entry.bounds.maxY / 2 - extent.minY) / height) * 65535) : 0;
      entry.rank = (spread16(x) | (spread16(y) << 1)) >>> 0;
    }
    entries.sort((a, b) => a.rank - b.rank || a.order - b.order);
    const build = (lo: number, hi: number): Node<T> => {
      if (hi - lo <= 8) {
        const leaf = entries.slice(lo, hi);
        let b = leaf[0].bounds;
        for (const e of leaf) b = union(b, e.bounds);
        return { bounds: b, entries: leaf };
      }
      const mid = (lo + hi) >> 1,
        left = build(lo, mid),
        right = build(mid, hi);
      return { bounds: union(left.bounds, right.bounds), left, right };
    };
    this.root = build(0, entries.length);
  }
  /** Best-first traversal by conservative distance to bounds; the caller can
   * stop once this lower bound cannot improve its bounded candidate prefix. */
  *nearest(
    bounds: SpatialBounds,
    point: readonly [number, number]
  ): Generator<{ value: T; distance: number; order: number }> {
    type Pending = { distance: number; node?: Node<T>; entry?: Entry<T> };
    const queue: Pending[] = [];
    const add = (item: Node<T> | Entry<T>) => {
      if (!overlaps(item.bounds, bounds)) return;
      const dx = Math.max(item.bounds.minX - point[0], 0, point[0] - item.bounds.maxX);
      const dy = Math.max(item.bounds.minY - point[1], 0, point[1] - item.bounds.maxY);
      const pending: Pending =
        "value" in item ? { distance: Math.hypot(dx, dy), entry: item } : { distance: Math.hypot(dx, dy), node: item };
      let lo = 0,
        hi = queue.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (queue[mid].distance <= pending.distance) lo = mid + 1;
        else hi = mid;
      }
      queue.splice(lo, 0, pending);
    };
    if (this.root) add(this.root);
    while (queue.length) {
      const item = queue.shift()!;
      if (item.entry) {
        this.visitedEntries++;
        yield { value: item.entry.value, distance: item.distance, order: item.entry.order };
      } else if (item.node?.entries) for (const entry of item.node.entries) add(entry);
      else if (item.node) {
        if (item.node.left) add(item.node.left);
        if (item.node.right) add(item.node.right);
      }
    }
  }
  query(bounds: SpatialBounds): T[] {
    const found: Entry<T>[] = [];
    const visit = (node?: Node<T>) => {
      if (!node || !overlaps(node.bounds, bounds)) return;
      if (node.entries)
        for (const entry of node.entries) {
          this.visitedEntries++;
          if (overlaps(entry.bounds, bounds)) found.push(entry);
        }
      else {
        visit(node.left);
        visit(node.right);
      }
    };
    visit(this.root);
    return found.sort((a, b) => a.order - b.order).map(entry => entry.value);
  }
}
