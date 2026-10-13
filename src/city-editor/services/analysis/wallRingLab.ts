import {
  CITY_SIZE_PRESETS,
  type CitySizePreset,
  createGridDocument,
  nPatchesForTownCells
} from "../../generators/document";
import { polygonArea, polygonCentroid } from "../../generators/geom";
import { facePoints } from "../../generators/mesh";
import { DEFAULT_PATCH_PARAMS } from "../../generators/patches";
import { makeRng } from "../../generators/prng";
import type { GridKind } from "../../types/contracts/document";
import type { Id, Mesh, Point } from "../../types/document";

/**
 * Wall-ring lab (docs/plan/ce-multi-ring-walls.md). Geometry only: on a real
 * CE starting mesh, nest town-wall rings by area share, route gate-to-plaza
 * arteries on cell edges, reserve a castle in the innermost ring and measure
 * whether the rings, gates and streets still fit. No water, buildings or
 * wall routing; the built-up area is the dry disk of the city radius.
 */

export type LabCastleSize = "none" | "tiny" | "small" | "standard" | "large";

export interface WallRingLabCase {
  grid: GridKind;
  size: CitySizePreset;
  seed: string;
  cityRadiusMeters: number;
  /** Area shares of the built-up disk, innermost first. The last is the outer wall. */
  ringShares: number[];
  castle: LabCastleSize;
  /** External roads meeting the outer wall. */
  gates: number;
  /** Required cell layers between consecutive walls. */
  minGapCells: number;
  /** Required non-castle cells inside the innermost wall. */
  minFreeCells: number;
  /** Required free area inside the innermost wall, in castle target areas. */
  minFreeAreaRatio: number;
  hexSizeMeters?: number;
  /** Evolution only: PatchParams.rimGrowthPercent (100 = current grid). */
  rimGrowthPercent?: number;
  /** Evolution only: override nPatchesForTownCells (sites = 8×). */
  nPatches?: number;
  /** Evolution only: PatchParams.maxPatches for the automatic count. */
  maxPatches?: number;
}

export interface RingStats {
  faces: number;
  areaM2: number;
  equivalentRadiusM: number;
  /** 4πA/P²; 1 is a circle. */
  circularity: number;
  wallEdges: number;
  /** Cell layers between this wall and the next outer one; null for the outer wall. */
  gapCells: number | null;
  gapMeters: number | null;
  gates: number;
  touchesFrame: boolean;
  /** Boundary vertices shared by more than two wall edges (pinched wall). */
  pinches: number;
}

export interface WallRingLabResult {
  input: WallRingLabCase;
  extentMeters: number;
  meshFaces: number;
  builtUpFaces: number;
  medianCellMeters: number;
  rings: RingStats[];
  castleTargetM2: number;
  castleFaces: number;
  castleAreaM2: number;
  freeFaces: number;
  freeAreaM2: number;
  freeComponents: number;
  routesPlanned: number;
  routesReached: number;
  /** Face cuts (gate spokes) the arteries needed. */
  gateCuts: number;
  innerGatesReachable: number;
  failures: string[];
  ok: boolean;
  /** For SVG rendering. */
  geometry: {
    faces: Array<{ id: Id; points: Point[]; ring: number; castle: boolean }>;
    walls: Array<{ ring: number; segments: [Point, Point][] }>;
    routes: Point[][];
    gates: Array<{ ring: number; point: Point }>;
    plaza: Point | null;
  };
}

/** Same targets as castlePlacement's `castleTargetArea`. */
export function labCastleTargetArea(size: LabCastleSize): number {
  return size === "none" ? 0 : size === "tiny" ? 1800 : size === "small" ? 4000 : size === "large" ? 18000 : 9000;
}

interface FaceInfo {
  id: Id;
  points: Point[];
  centroid: Point;
  dist: number;
  area: number;
  neighbors: Id[];
  frame: boolean;
}

function buildFaces(mesh: Mesh): Map<Id, FaceInfo> {
  const faces = new Map<Id, FaceInfo>();
  for (const face of Object.values(mesh.faces)) {
    const points = facePoints(mesh, face);
    const centroid = polygonCentroid(points);
    faces.set(face.id, {
      id: face.id,
      points,
      centroid,
      dist: Math.hypot(centroid[0], centroid[1]),
      area: Math.abs(polygonArea(points)),
      neighbors: [],
      frame: false
    });
  }
  for (const edge of Object.values(mesh.edges)) {
    const l = edge.leftFace ? faces.get(edge.leftFace) : undefined;
    const r = edge.rightFace ? faces.get(edge.rightFace) : undefined;
    if (l && r) {
      l.neighbors.push(r.id);
      r.neighbors.push(l.id);
    } else (l ?? r)!.frame = true;
  }
  return faces;
}

function component(faces: Map<Id, FaceInfo>, members: Set<Id>, start: Id): Set<Id> {
  const seen = new Set<Id>([start]);
  const queue = [start];
  while (queue.length) {
    const id = queue.pop()!;
    for (const n of faces.get(id)!.neighbors)
      if (members.has(n) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return seen;
}

/** Add enclosed complement pockets so each ring is a single loop. */
function fillHoles(faces: Map<Id, FaceInfo>, set: Set<Id>): void {
  const outside = new Set<Id>();
  const queue: Id[] = [];
  for (const f of faces.values())
    if (!set.has(f.id) && f.frame) {
      outside.add(f.id);
      queue.push(f.id);
    }
  while (queue.length) {
    const id = queue.pop()!;
    for (const n of faces.get(id)!.neighbors)
      if (!set.has(n) && !outside.has(n)) {
        outside.add(n);
        queue.push(n);
      }
  }
  for (const f of faces.values()) if (!set.has(f.id) && !outside.has(f.id)) set.add(f.id);
}

const areaOf = (faces: Map<Id, FaceInfo>, ids: Iterable<Id>) => {
  let a = 0;
  for (const id of ids) a += faces.get(id)!.area;
  return a;
};

/** Distance-ordered prefix, then pulled round: add in-circle cells, drop protruding ones. */
function selectRing(
  faces: Map<Id, FaceInfo>,
  builtUp: Set<Id>,
  ordered: FaceInfo[],
  target: number,
  inner: Set<Id> | null,
  center: Id
): Set<Id> {
  const set = new Set<Id>(inner ?? []);
  let area = areaOf(faces, set);
  for (const f of ordered) {
    if (set.has(f.id)) continue;
    if (set.size && Math.abs(area - target) <= Math.abs(area + f.area - target)) break;
    set.add(f.id);
    area += f.area;
  }
  const r = Math.sqrt(target / Math.PI);
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const id of [...set]) {
      if (id === center || inner?.has(id)) continue;
      const f = faces.get(id)!;
      if (f.dist > 1.15 * r && f.neighbors.some(n => !set.has(n))) {
        set.delete(id);
        changed = true;
      }
    }
    for (const id of [...set])
      for (const n of faces.get(id)!.neighbors)
        if (!set.has(n) && builtUp.has(n) && faces.get(n)!.dist <= r) {
          set.add(n);
          changed = true;
        }
    if (!changed) break;
  }
  const connected = component(faces, set, center);
  fillHoles(faces, connected);
  for (const id of connected) if (!builtUp.has(id)) connected.delete(id);
  return connected;
}

interface Graph {
  adj: Map<Id, Array<{ to: Id; edge: Id; w: number }>>;
  point: (v: Id) => Point;
}

function dijkstra(graph: Graph, from: Id, to: Id, blocked: Set<Id>, edgeOk: (e: Id) => boolean): Id[] | null {
  const dist = new Map<Id, number>([[from, 0]]);
  const prev = new Map<Id, Id>();
  const heap: Array<[number, Id]> = [[0, from]];
  const push = (item: [number, Id]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, v] = pop();
    if (v === to) break;
    if (d > (dist.get(v) ?? Infinity)) continue;
    for (const { to: n, edge, w } of graph.adj.get(v) ?? []) {
      if ((blocked.has(n) && n !== to) || !edgeOk(edge)) continue;
      const nd = d + w;
      if (nd < (dist.get(n) ?? Infinity)) {
        dist.set(n, nd);
        prev.set(n, v);
        push([nd, n]);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return path;
}

export function runWallRingLab(input: WallRingLabCase): WallRingLabResult {
  const preset = CITY_SIZE_PRESETS[input.size];
  const extentMeters = preset.extentMeters;
  const doc = createGridDocument({
    size: input.size,
    seed: input.seed,
    grid: input.grid,
    cityRadiusMeters: input.cityRadiusMeters,
    hexSizeMeters: input.hexSizeMeters,
    patchParams: {
      ...DEFAULT_PATCH_PARAMS,
      nPatches: input.nPatches ?? nPatchesForTownCells(extentMeters, input.maxPatches),
      rimGrowthPercent: input.rimGrowthPercent
    }
  });
  const mesh = doc.mesh;
  const faces = buildFaces(mesh);
  const failures: string[] = [];
  const all = [...faces.values()];
  const center = all.reduce((a, b) => (b.dist < a.dist ? b : a)).id;

  const disk = new Set(all.filter(f => f.dist <= input.cityRadiusMeters).map(f => f.id));
  disk.add(center);
  const builtUp = component(faces, disk, center);
  const builtArea = areaOf(faces, builtUp);
  const ordered = all.filter(f => builtUp.has(f.id)).sort((a, b) => a.dist - b.dist);
  const areas = ordered.map(f => f.area).sort((a, b) => a - b);
  const medianCellMeters = Math.sqrt(areas[Math.floor(areas.length / 2)] ?? 0);

  // Nested rings, innermost first.
  const shares = [...input.ringShares].sort((a, b) => a - b);
  const rings: Set<Id>[] = [];
  for (const share of shares)
    rings.push(selectRing(faces, builtUp, ordered, builtArea * share, rings.at(-1) ?? null, center));
  const ringOf = new Map<Id, number>();
  for (let i = rings.length - 1; i >= 0; i--) for (const id of rings[i]) ringOf.set(id, i);
  const outer = rings.at(-1)!;

  // Wall edges per ring.
  const edgeFaces = (eid: Id): (Id | null)[] => {
    const chord = chordFace.get(eid);
    if (chord) return [chord, chord];
    const e = mesh.edges[eid];
    return [e.leftFace, e.rightFace];
  };
  const wallEdges: Set<Id>[] = rings.map(ring => {
    const set = new Set<Id>();
    for (const e of Object.values(mesh.edges)) {
      const inL = !!e.leftFace && ring.has(e.leftFace);
      const inR = !!e.rightFace && ring.has(e.rightFace);
      if (inL !== inR) set.add(e.id);
    }
    return set;
  });
  const anyWall = new Set(wallEdges.flatMap(s => [...s]));
  const wallVertices = wallEdges.map(set => {
    const count = new Map<Id, number>();
    for (const eid of set)
      for (const v of [mesh.edges[eid].a, mesh.edges[eid].b]) count.set(v, (count.get(v) ?? 0) + 1);
    return count;
  });
  const point = (v: Id) => mesh.vertices[v].point;

  // Edge graph inside the outer wall; wall edges are not streets.
  const graph: Graph = { adj: new Map(), point };
  for (const e of Object.values(mesh.edges)) {
    if (anyWall.has(e.id)) continue;
    if (!e.leftFace || !e.rightFace || !outer.has(e.leftFace) || !outer.has(e.rightFace)) continue;
    const w = Math.hypot(point(e.a)[0] - point(e.b)[0], point(e.a)[1] - point(e.b)[1]);
    for (const [a, b] of [
      [e.a, e.b],
      [e.b, e.a]
    ]) {
      if (!graph.adj.has(a)) graph.adj.set(a, []);
      graph.adj.get(a)!.push({ to: b, edge: e.id, w });
    }
  }

  // Gate spokes: a wall vertex has one street edge on a degree-3 mesh, so CE
  // cuts a spoke across the adjacent face. Model it as a chord to the face's
  // other non-adjacent vertices (a penalised edge, counted as a cut).
  const chordFace = new Map<Id, Id>();
  const allWallVertices = new Set(wallVertices.flatMap(c => [...c.keys()]));
  for (const id of outer) {
    const ring = mesh.faces[id].boundary.map(ref =>
      ref.forward ? mesh.edges[ref.edgeId].a : mesh.edges[ref.edgeId].b
    );
    ring.forEach((v, k) => {
      if (!allWallVertices.has(v)) return;
      for (let j = 0; j < ring.length; j++) {
        const u = ring[j];
        if (j === k || j === (k + 1) % ring.length || (j + 1) % ring.length === k) continue;
        const eid = `chord:${id}:${v}:${u}`;
        chordFace.set(eid, id);
        const w = 1.5 * Math.hypot(point(v)[0] - point(u)[0], point(v)[1] - point(u)[1]);
        for (const [a, b] of [
          [v, u],
          [u, v]
        ]) {
          if (!graph.adj.has(a)) graph.adj.set(a, []);
          graph.adj.get(a)!.push({ to: b, edge: eid, w });
        }
      }
    });
  }

  // Castle: grown from the innermost wall, on the side away from the roads.
  const rng = makeRng(`${input.seed}:wall-ring-lab`);
  const bearings = Array.from(
    { length: Math.max(1, input.gates) },
    (_, i) => ((i + rng.range(-0.3, 0.3)) / Math.max(1, input.gates)) * Math.PI * 2
  );
  const roadMean: Point = bearings.reduce<Point>((s, b) => [s[0] + Math.cos(b), s[1] + Math.sin(b)], [0, 0]);
  const away = Math.hypot(...roadMean) > 1e-6 ? Math.atan2(-roadMean[1], -roadMean[0]) : rng.range(0, Math.PI * 2);
  const castleTargetM2 = labCastleTargetArea(input.castle);
  const castle = new Set<Id>();
  const innermost = rings[0];
  if (castleTargetM2 > 0) {
    const edgeFacesIn = [...innermost].filter(id => faces.get(id)!.neighbors.some(n => !innermost.has(n)));
    const dir: Point = [Math.cos(away), Math.sin(away)];
    const seedFace = (edgeFacesIn.length ? edgeFacesIn : [...innermost]).reduce((a, b) => {
      const pa = faces.get(a)!.centroid,
        pb = faces.get(b)!.centroid;
      return pb[0] * dir[0] + pb[1] * dir[1] > pa[0] * dir[0] + pa[1] * dir[1] ? b : a;
    });
    castle.add(seedFace);
    let area = faces.get(seedFace)!.area;
    const seedPoint = faces.get(seedFace)!.centroid;
    while (area < castleTargetM2 && castle.size < innermost.size - 1) {
      let best: FaceInfo | null = null;
      for (const id of castle)
        for (const n of faces.get(id)!.neighbors) {
          if (!innermost.has(n) || castle.has(n) || n === center) continue;
          const f = faces.get(n)!;
          const d = Math.hypot(f.centroid[0] - seedPoint[0], f.centroid[1] - seedPoint[1]);
          if (!best || d < Math.hypot(best.centroid[0] - seedPoint[0], best.centroid[1] - seedPoint[1])) best = f;
        }
      if (!best) break;
      castle.add(best.id);
      area += best.area;
    }
  }
  const castleAreaM2 = areaOf(faces, castle);
  const castleVertices = new Set<Id>();
  for (const id of castle)
    for (const ref of mesh.faces[id].boundary) {
      const e = mesh.edges[ref.edgeId];
      castleVertices.add(e.a);
      castleVertices.add(e.b);
    }
  const free = new Set([...innermost].filter(id => !castle.has(id)));
  let freeComponents = 0;
  {
    const left = new Set(free);
    while (left.size) {
      const start = left.values().next().value!;
      for (const id of component(faces, free, start)) left.delete(id);
      freeComponents++;
    }
  }

  // Plaza: the free-cell vertex nearest the centre, off the castle.
  const plazaFace = [...free].sort((a, b) => faces.get(a)!.dist - faces.get(b)!.dist)[0];
  const plazaCandidates = plazaFace
    ? mesh.faces[plazaFace].boundary
        .flatMap(ref => [mesh.edges[ref.edgeId].a, mesh.edges[ref.edgeId].b])
        .filter(v => !castleVertices.has(v) && graph.adj.has(v) && !wallVertices.some(c => c.has(v)))
    : [];
  const plaza = plazaCandidates.sort((a, b) => Math.hypot(...point(a)) - Math.hypot(...point(b)))[0] ?? null;
  if (!plaza) failures.push("no-plaza-vertex");

  // Outer gates: wall vertices nearest each road bearing, not on the frame.
  const outerWallVertices = [...wallVertices.at(-1)!.entries()].filter(([v, n]) => {
    if (n !== 2) return false;
    return graph.adj.has(v);
  });
  const outerGates = new Set<Id>();
  for (const b of bearings) {
    let best: Id | null = null,
      bestDiff = Infinity;
    for (const [v] of outerWallVertices) {
      const p = point(v);
      let diff = Math.abs(Math.atan2(p[1], p[0]) - b) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < bestDiff) {
        best = v;
        bestDiff = diff;
      }
    }
    if (best) outerGates.add(best);
  }
  if (outerGates.size < Math.min(input.gates, 2)) failures.push("outer-gates-short");

  // Arteries. Castle vertices are blocked; streets may cross inner walls only at a vertex.
  const routes: Id[][] = [];
  let routesReached = 0;
  for (const gate of outerGates) {
    if (!plaza) break;
    const path = dijkstra(graph, gate, plaza, castleVertices, () => true);
    if (path) {
      routes.push(path);
      routesReached++;
    }
  }
  if (routesReached < outerGates.size) failures.push("artery-unroutable");

  // Inner gates: where each artery enters ring i (i < outer).
  const gatesPerRing: Set<Id>[] = rings.map(() => new Set());
  gatesPerRing[rings.length - 1] = outerGates;
  const edgeBetween = (a: Id, b: Id) => graph.adj.get(a)!.find(x => x.to === b)!.edge;
  for (const path of routes)
    for (let i = 0; i < rings.length - 1; i++)
      for (let k = 1; k < path.length - 1; k++) {
        const v = path[k];
        if (!wallVertices[i].has(v)) continue;
        const [fl, fr] = edgeFaces(edgeBetween(v, path[k + 1]));
        if (fl && fr && rings[i].has(fl) && rings[i].has(fr)) {
          gatesPerRing[i].add(v);
          break;
        }
      }
  let gateCuts = 0;
  for (const path of routes)
    for (let k = 1; k < path.length; k++) if (chordFace.has(edgeBetween(path[k - 1], path[k]))) gateCuts++;
  const innerGatesReachable = rings.length > 1 ? gatesPerRing[0].size : outerGates.size;

  // Ring metrics.
  const ringStats: RingStats[] = rings.map((ring, i) => {
    const area = areaOf(faces, ring);
    let perimeter = 0;
    for (const eid of wallEdges[i]) {
      const e = mesh.edges[eid];
      perimeter += Math.hypot(point(e.a)[0] - point(e.b)[0], point(e.a)[1] - point(e.b)[1]);
    }
    let gapCells: number | null = null,
      gapMeters: number | null = null;
    if (i < rings.length - 1) {
      const next = rings[i + 1];
      const depth = new Map<Id, number>();
      const queue: Id[] = [...ring];
      for (const id of ring) depth.set(id, 0);
      let found = Infinity;
      for (let q = 0; q < queue.length; q++) {
        const id = queue[q];
        const d = depth.get(id)!;
        if (!next.has(id) || faces.get(id)!.frame) {
          found = Math.min(found, d - 1);
          continue;
        }
        for (const n of faces.get(id)!.neighbors)
          if (!depth.has(n)) {
            depth.set(n, d + 1);
            queue.push(n);
          }
      }
      gapCells = Number.isFinite(found) ? Math.max(0, found) : 0;
      const innerPts = [...wallVertices[i].keys()].map(point);
      const outerPts = [...wallVertices[i + 1].keys()].map(point);
      gapMeters = Math.round(
        Math.min(...innerPts.map(p => Math.min(...outerPts.map(q => Math.hypot(p[0] - q[0], p[1] - q[1])))))
      );
    }
    return {
      faces: ring.size,
      areaM2: Math.round(area),
      equivalentRadiusM: Math.round(Math.sqrt(area / Math.PI)),
      circularity: perimeter ? Math.round(((4 * Math.PI * area) / perimeter ** 2) * 1000) / 1000 : 0,
      wallEdges: wallEdges[i].size,
      gapCells,
      gapMeters,
      gates: gatesPerRing[i].size,
      touchesFrame: [...ring].some(id => faces.get(id)!.frame),
      pinches: [...wallVertices[i].values()].filter(n => n > 2).length
    };
  });

  ringStats.forEach((r, i) => {
    if (r.touchesFrame) failures.push(`ring${i}-touches-frame`);
    if (r.gapCells !== null && r.gapCells < input.minGapCells) failures.push(`ring${i}-gap-${r.gapCells}`);
    if (r.pinches) failures.push(`ring${i}-pinched`);
  });
  if (rings.length > 1 && gatesPerRing[0].size < 2) failures.push(`ring0-gates-${gatesPerRing[0].size}`);
  if (castleTargetM2 > 0) {
    if (free.size < input.minFreeCells) failures.push(`free-cells-${free.size}`);
    if (areaOf(faces, free) < castleTargetM2 * input.minFreeAreaRatio) failures.push("free-area-short");
    if (freeComponents > 1) failures.push("free-area-split");
    if (castleAreaM2 < castleTargetM2) failures.push("castle-undersized");
  }

  const ringIndex = (id: Id) => ringOf.get(id) ?? -1;
  return {
    input,
    extentMeters,
    meshFaces: faces.size,
    builtUpFaces: builtUp.size,
    medianCellMeters: Math.round(medianCellMeters),
    rings: ringStats,
    castleTargetM2,
    castleFaces: castle.size,
    castleAreaM2: Math.round(castleAreaM2),
    freeFaces: free.size,
    freeAreaM2: Math.round(areaOf(faces, free)),
    freeComponents,
    routesPlanned: outerGates.size,
    routesReached,
    gateCuts,
    innerGatesReachable,
    failures,
    ok: failures.length === 0,
    geometry: {
      faces: all.map(f => ({ id: f.id, points: f.points, ring: ringIndex(f.id), castle: castle.has(f.id) })),
      walls: wallEdges.map((set, ring) => ({
        ring,
        segments: [...set].map(eid => [point(mesh.edges[eid].a), point(mesh.edges[eid].b)] as [Point, Point])
      })),
      routes: routes.map(path => path.map(point)),
      gates: gatesPerRing.flatMap((set, ring) => [...set].map(v => ({ ring, point: point(v) }))),
      plaza: plaza ? point(plaza) : null
    }
  };
}

const RING_FILLS = ["#e9c46a", "#f4a261", "#a8dadc", "#cdb4db", "#b5e48c"];

export function wallRingLabSvg(result: WallRingLabResult): string {
  // Crop to the town; the frame is mostly empty around a large preset.
  const half = Math.min(result.extentMeters / 2, result.input.cityRadiusMeters * 1.4);
  const fmt = (p: Point) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const parts: string[] = [];
  for (const f of result.geometry.faces) {
    const fill = f.castle ? "#6d597a" : f.ring >= 0 ? RING_FILLS[f.ring % RING_FILLS.length] : "#f1f1ec";
    parts.push(`<polygon points="${f.points.map(fmt).join(" ")}" fill="${fill}" stroke="#bbb" stroke-width="0.6"/>`);
  }
  for (const r of result.geometry.routes)
    parts.push(`<polyline points="${r.map(fmt).join(" ")}" fill="none" stroke="#8d6e63" stroke-width="5"/>`);
  for (const w of result.geometry.walls)
    for (const [a, b] of w.segments)
      parts.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#333" stroke-width="7"/>`);
  for (const g of result.geometry.gates)
    parts.push(`<circle cx="${g.point[0]}" cy="${g.point[1]}" r="12" fill="#fff" stroke="#c1121f" stroke-width="4"/>`);
  if (result.geometry.plaza)
    parts.push(`<circle cx="${result.geometry.plaza[0]}" cy="${result.geometry.plaza[1]}" r="14" fill="#c1121f"/>`);
  const i = result.input;
  const title = `${i.grid} ${i.size} r=${Math.round(i.cityRadiusMeters)}m rings=${i.ringShares.join("/")} castle=${i.castle}${i.grid === "evolution" ? ` rim=${i.rimGrowthPercent ?? 100}%` : ""} seed=${i.seed} ${result.ok ? "OK" : result.failures.join(" ")}`;
  parts.push(
    `<text x="${-half + 20}" y="${-half + 50}" font-size="${half / 30}" font-family="sans-serif">${title}</text>`
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${2 * half} ${2 * half}" width="1000" height="1000"><rect x="${-half}" y="${-half}" width="${2 * half}" height="${2 * half}" fill="#fff"/>${parts.join("")}</svg>`;
}
