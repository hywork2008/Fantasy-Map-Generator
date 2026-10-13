import { shortestPath } from "../../../core/features";
import { edgeBetween } from "../../../core/mesh";
import type { Id, Mesh, Point } from "../../../core/types";
import type { NearestVertex } from "../planning/meshLookup";

// --- mesh ⇆ Cell[] & polyline snapping --------------------------------------

/** Generator polyline → a contiguous list of mesh vertex ids (for a river). */
export function polylineToVertexPath(
  mesh: Mesh,
  polyline: Point[],
  nearest: NearestVertex,
  againstFlow: ReadonlySet<string> = new Set()
): Id[] {
  const raw: Id[] = [];
  for (const p of polyline) {
    const id = nearest(p);
    if (id && raw.at(-1) !== id) raw.push(id);
  }
  if (raw.length < 2) return raw;
  const out: Id[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const a = out.at(-1) as Id;
    const b = raw[i];
    if (a === b) continue;
    if (edgeBetween(mesh, a, b) && !againstFlow.has(`${a}>${b}`)) {
      out.push(b);
      continue;
    }
    const bridge = againstFlow.size
      ? shortestPathWithFlow(mesh, a, b, againstFlow, new Set(out.slice(0, -1)))
      : shortestPath(mesh, a, b);
    if (!bridge) return []; // Never emit a river that ends at an interior gap.
    out.push(...bridge.slice(1));
  }
  // Snapping the resolved walk back to mesh vertices can revisit a vertex even
  // when the geometric walk has no loop (for example A → B → A). Remove the
  // closed span so the emitted river cannot double back over its own edge.
  const simple: Id[] = [];
  const index = new Map<Id, number>();
  for (const id of out) {
    const previous = index.get(id);
    if (previous !== undefined) {
      for (const removed of simple.splice(previous + 1)) index.delete(removed);
    } else {
      index.set(id, simple.length);
      simple.push(id);
    }
  }
  return simple;
}

/** Bridge a graph-walk gap without reversing an already emitted river edge. */
export function shortestPathWithFlow(
  mesh: Mesh,
  from: Id,
  to: Id,
  againstFlow: ReadonlySet<string>,
  visited: ReadonlySet<Id>
): Id[] | null {
  const adjacent = new Map<Id, Id[]>();
  for (const edge of Object.values(mesh.edges)) {
    (adjacent.get(edge.a) ?? adjacent.set(edge.a, []).get(edge.a)!).push(edge.b);
    (adjacent.get(edge.b) ?? adjacent.set(edge.b, []).get(edge.b)!).push(edge.a);
  }
  for (const neighbors of adjacent.values()) neighbors.sort();
  const previous = new Map<Id, Id | null>([[from, null]]);
  const queue = [from];
  for (let i = 0; i < queue.length && !previous.has(to); i++) {
    const id = queue[i];
    for (const neighbor of adjacent.get(id) ?? []) {
      if (previous.has(neighbor) || (visited.has(neighbor) && neighbor !== to)) continue;
      if (againstFlow.has(`${id}>${neighbor}`)) continue;
      previous.set(neighbor, id);
      queue.push(neighbor);
    }
  }
  if (!previous.has(to)) return null;
  const path: Id[] = [];
  for (let id: Id | null = to; id; id = previous.get(id) ?? null) path.push(id);
  return path.reverse();
}
