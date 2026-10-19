import FlatQueue from "flatqueue";
import type { CityDocument, EdgeFeatureGroup, EdgeRef, Id, Mesh } from "../types/document";
import type { EdgeGraph } from "./edgeGraph";

export type RoadGroup = EdgeFeatureGroup & { kind: "road" };

/** Erase excursions without changing the order of the surviving edges. A
 * protected stop in an excursion requires a separate access route instead. */
export function simpleRoadPath<T>(
  path: readonly T[],
  protectedStops: ReadonlySet<T> = new Set(),
  preserveClosed = false
): T[] | null {
  const result: T[] = [];
  const position = new Map<T, number>();
  const closed = preserveClosed && path.length >= 4 && path[0] === path.at(-1);
  for (const node of closed ? path.slice(0, -1) : path) {
    const at = position.get(node);
    if (at !== undefined) {
      if (result.slice(at + 1).some(stop => protectedStops.has(stop))) return null;
      for (const removed of result.splice(at + 1)) position.delete(removed);
    } else {
      position.set(node, result.length);
      result.push(node);
    }
  }
  return closed ? (result.length >= 3 ? [...result, result[0]] : null) : result;
}

/** Dijkstra for a set of legal attachment vertices. Reuse costs may be below
 * physical distance, so a Euclidean A* heuristic is not assumed here. */
export function shortestRoadPath(
  graph: EdgeGraph,
  start: number,
  targets: ReadonlySet<number>,
  cost: (a: number, b: number, length: number) => number,
  limit = Infinity
): number[] | null {
  const distance = new Float64Array(graph.points.length).fill(Infinity);
  const previous = new Int32Array(graph.points.length).fill(-1);
  const queue = new FlatQueue<number>();
  distance[start] = 0;
  queue.push(start, 0);
  while (queue.length) {
    const score = queue.peekValue()!;
    const node = queue.pop()!;
    if (score !== distance[node]) continue;
    if (targets.has(node)) {
      const path = [node];
      for (let at = node; at !== start; ) {
        at = previous[at];
        path.push(at);
      }
      return path.reverse();
    }
    for (const edge of graph.adjacency[node]) {
      const next = score + cost(node, edge.to, edge.w);
      if (next >= distance[edge.to] || next > limit) continue;
      distance[edge.to] = next;
      previous[edge.to] = node;
      queue.push(edge.to, next);
    }
  }
  return null;
}

export function roadPathVertices(mesh: Mesh, segments: readonly EdgeRef[]): Id[] {
  if (!segments.length) return [];
  const first = mesh.edges[segments[0].edgeId];
  return [
    segments[0].forward ? first.a : first.b,
    ...segments.map(ref => mesh.edges[ref.edgeId][ref.forward ? "b" : "a"])
  ];
}

export function simpleRoadSegments(mesh: Mesh, segments: EdgeRef[], protectedStops: ReadonlySet<Id>): EdgeRef[] | null {
  const nodes = simpleRoadPath(roadPathVertices(mesh, segments), protectedStops);
  if (!nodes) return null;
  const edgeFor = new Map<Id, Map<Id, EdgeRef>>();
  for (const ref of segments) {
    const edge = mesh.edges[ref.edgeId];
    for (const [a, b, forward] of [
      [edge.a, edge.b, true],
      [edge.b, edge.a, false]
    ] as const) {
      if (!edgeFor.has(a)) edgeFor.set(a, new Map());
      edgeFor.get(a)!.set(b, { edgeId: edge.id, forward });
    }
  }
  return nodes.slice(1).map((id, i) => edgeFor.get(nodes[i])!.get(id)!);
}

/** Gate streets end at the first junction that already reaches their
 * destination. Separate dry plaza components are separate destinations. */
export class RootedRoadNetwork {
  private readonly destinations = new Map<Id, Set<Id>>();
  private readonly connected = new Map<string, Set<Id>>();

  constructor(private readonly document: CityDocument) {
    const { mesh } = document;
    const faces = new Set(
      document.elements
        .flatMap(element => (element.kind === "plaza" ? element.faceIds : []))
        .filter(id => mesh.faces[id]?.properties.water === "land")
    );
    const walls = new Set(
      document.featureGroups.flatMap(group => (group.kind === "wall" ? group.segments.map(ref => ref.edgeId) : []))
    );
    const pair = (a: Id, b: Id) => (a < b ? `${a}\0${b}` : `${b}\0${a}`);
    const rivers = new Set(
      document.featureGroups.flatMap(group =>
        group.kind === "river" ? group.vertices.slice(1).map((id, i) => pair(group.vertices[i], id)) : []
      )
    );
    const visited = new Set<Id>();
    for (const start of faces) {
      if (visited.has(start)) continue;
      const queue = [start];
      visited.add(start);
      for (const id of queue)
        for (const ref of mesh.faces[id].boundary) {
          const edge = mesh.edges[ref.edgeId];
          for (const vertex of [edge.a, edge.b]) {
            if (!this.destinations.has(vertex)) this.destinations.set(vertex, new Set());
            this.destinations.get(vertex)!.add(start);
          }
          if (walls.has(edge.id) || rivers.has(pair(edge.a, edge.b))) continue;
          const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
          if (!other || !faces.has(other) || visited.has(other)) continue;
          visited.add(other);
          queue.push(other);
        }
    }
  }

  join(segments: EdgeRef[]): EdgeRef[] {
    const nodes = roadPathVertices(this.document.mesh, segments);
    if (!nodes.length) return segments;
    const end = nodes.at(-1)!;
    const plazas = this.destinations.get(end);
    const key = plazas?.size === 1 ? `plaza:${[...plazas][0]}` : `vertex:${end}`;
    let existing = this.connected.get(key);
    if (!existing) {
      existing = new Set();
      this.connected.set(key, existing);
    }
    const junction = nodes.findIndex(id => existing.has(id));
    const result = junction < 0 ? segments : segments.slice(0, junction);
    for (const id of roadPathVertices(this.document.mesh, result)) existing.add(id);
    return result;
  }
}

/** Invocation-local occupancy. Routes keep their identities and ordered refs;
 * only newly useful physical edges justify an optional street. */
export class RoadNetwork {
  readonly edges = new Set<Id>();
  readonly vertices = new Set<Id>();
  private readonly fronted = new Set<Id>();
  private readonly adjacency = new Map<Id, Map<Id, number>>();

  constructor(
    private readonly mesh: Mesh,
    groups: CityDocument["featureGroups"] = []
  ) {
    for (const group of groups) if (group.kind === "road") this.add(group.segments);
  }

  add(segments: readonly EdgeRef[]): void {
    for (const ref of segments) {
      if (this.edges.has(ref.edgeId)) continue;
      const edge = this.mesh.edges[ref.edgeId];
      if (!edge) continue;
      this.edges.add(edge.id);
      const length = this.length(ref.edgeId);
      for (const [a, b] of [
        [edge.a, edge.b],
        [edge.b, edge.a]
      ]) {
        this.vertices.add(a);
        if (!this.adjacency.has(a)) this.adjacency.set(a, new Map());
        this.adjacency.get(a)!.set(b, length);
      }
      for (const face of [edge.leftFace, edge.rightFace]) if (face) this.fronted.add(face);
    }
  }

  /** A new frontage, a new connection, or a material shortcut is useful.
   * A detached candidate must first acquire a legal connector. */
  useful(segments: readonly EdgeRef[]): boolean {
    const fresh = segments.filter(ref => !this.edges.has(ref.edgeId));
    if (!fresh.length) return false;
    const nodes = roadPathVertices(this.mesh, segments);
    if (this.edges.size && !nodes.some(id => this.vertices.has(id))) return false;
    if (!this.edges.size) return true;
    for (const ref of fresh) {
      const edge = this.mesh.edges[ref.edgeId];
      for (const id of [edge.leftFace, edge.rightFace]) {
        if (!id || this.fronted.has(id)) continue;
        const face = this.mesh.faces[id];
        if (
          face?.properties.water === "land" &&
          face.properties.buildable &&
          !face.properties.locked &&
          !["farm", "park", "cemetery", "empty"].includes(face.properties.ward ?? "")
        )
          return true;
      }
    }
    // Test each excursion between existing junctions, rather than comparing
    // the whole route (which can contain long stretches of shared roadway).
    let anchor: Id | undefined;
    let length = 0;
    let hasFresh = false;
    for (let i = 0; i < nodes.length; i++) {
      if (i) {
        length += this.length(segments[i - 1].edgeId);
        hasFresh ||= !this.edges.has(segments[i - 1].edgeId);
      }
      if (!this.vertices.has(nodes[i])) continue;
      if (anchor !== undefined && hasFresh && this.distance(anchor, nodes[i], length * 1.1) > length * 1.1) return true;
      anchor = nodes[i];
      length = 0;
      hasFresh = false;
    }
    return false;
  }

  counts(): Record<string, number> {
    const seen = new Set<Id>();
    let components = 0;
    for (const start of this.vertices) {
      if (seen.has(start)) continue;
      components++;
      const queue = [start];
      seen.add(start);
      for (const id of queue)
        for (const next of this.adjacency.get(id)?.keys() ?? []) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
    }
    return {
      roadEdges: this.edges.size,
      roadComponents: components,
      roadLengthMeters: [...this.edges].reduce((sum, id) => sum + this.length(id), 0)
    };
  }

  private length(edgeId: Id): number {
    const edge = this.mesh.edges[edgeId];
    const a = this.mesh.vertices[edge.a].point;
    const b = this.mesh.vertices[edge.b].point;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  private distance(start: Id, end: Id, limit: number): number {
    const distance = new Map<Id, number>([[start, 0]]);
    const queue = new FlatQueue<Id>();
    queue.push(start, 0);
    while (queue.length) {
      const score = queue.peekValue()!;
      const id = queue.pop()!;
      if (score !== distance.get(id)) continue;
      if (id === end) return score;
      for (const [next, length] of this.adjacency.get(id) ?? []) {
        const candidate = score + length;
        if (candidate > limit || candidate >= (distance.get(next) ?? Infinity)) continue;
        distance.set(next, candidate);
        queue.push(next, candidate);
      }
    }
    return Infinity;
  }
}

export interface PhysicalRoadRun {
  group: RoadGroup;
  segments: EdgeRef[];
  /** All logical routes using this physical interval, including its owner. */
  routeIds: Id[];
}

/** Resolve shared edges once for SVG and 3D. Attribute changes split runs;
 * original groups and saved source-road identities are never rewritten. */
export function physicalRoadRuns(
  document: CityDocument,
  include: (group: RoadGroup) => boolean = () => true
): PhysicalRoadRun[] {
  const groups = document.featureGroups.filter((group): group is RoadGroup => group.kind === "road").filter(include);
  const owners = new Map<Id, RoadGroup>();
  const routes = new Map<Id, Set<Id>>();
  const rank = (group: RoadGroup) => {
    if (!group.sourceRoad) return 1;
    const source = document.fabric?.generation?.settings?.descriptor?.roads?.[group.sourceRoad.index];
    return source?.routeId === group.sourceRoad.routeId && source.group === "roads" ? 2 : 0;
  };
  const better = (a: RoadGroup, b: RoadGroup) =>
    a.style.widthMeters > b.style.widthMeters ||
    (a.style.widthMeters === b.style.widthMeters &&
      (rank(a) > rank(b) ||
        (rank(a) === rank(b) && (Number(a.locked) > Number(b.locked) || (a.locked === b.locked && a.id < b.id)))));
  for (const group of groups)
    for (const ref of group.segments) {
      if (!document.mesh.edges[ref.edgeId]) continue;
      const owner = owners.get(ref.edgeId);
      if (!owner || better(group, owner)) owners.set(ref.edgeId, group);
      if (!routes.has(ref.edgeId)) routes.set(ref.edgeId, new Set());
      routes.get(ref.edgeId)!.add(group.id);
    }
  const runs: PhysicalRoadRun[] = [];
  const used = new Set<Id>();
  for (const group of groups) {
    let current: PhysicalRoadRun | undefined;
    for (const ref of group.segments) {
      if (owners.get(ref.edgeId) !== group || used.has(ref.edgeId)) {
        current = undefined;
        continue;
      }
      const routeIds = [...routes.get(ref.edgeId)!].sort();
      const edge = document.mesh.edges[ref.edgeId];
      const previous = current?.segments.at(-1);
      const previousEdge = previous && document.mesh.edges[previous.edgeId];
      if (
        !current ||
        current.routeIds.join("\0") !== routeIds.join("\0") ||
        (previousEdge && previousEdge[previous!.forward ? "b" : "a"] !== edge[ref.forward ? "a" : "b"])
      ) {
        current = { group, segments: [], routeIds };
        runs.push(current);
      }
      current.segments.push(ref);
      used.add(ref.edgeId);
    }
  }
  return runs;
}
