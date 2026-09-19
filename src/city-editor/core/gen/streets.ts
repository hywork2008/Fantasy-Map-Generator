// S5 — the street network (design §4.2 S5, TownGeneratorTS 2.4 `buildStreets`).
//
// Everything is routed with A* over the SAME Voronoi cell-edge graph the river
// and coastline use (core/edgeGraph.ts). Two kinds come out of it:
//
//   • streets — intramural arteries. Tiny maps keep gate → plaza; Small and
//     larger use through-axes, parallel ribs, and a wall-hugging ring. They are
//     drawn as major roads on the mesh. Local alleys stay derived infill.
//   • roads   — a far node in the gate's bearing → the gate, run OUTSIDE the
//     perimeter. These ARE drawn, as a double line.
//
// The A* graph is masked by NODE (this is TownGenerator's `Topology`: build from
// all cell edges, close off the citadel and the wall line): a street only steps
// between vertices of `urban` cells and never through the citadel enceinte; a
// road only steps between NON-urban vertices ("outside the wall" then follows,
// because the wall wraps the urban fabric). River-walked cell edges are a
// never-exempted hard bar for both (design §3.1: river + road may not share an
// edge — not a high cost). `tidyUpRoads` splits the union of streets + roads at
// every junction, drops the plaza's own edges and smooths each run's interior
// vertices (endpoints — gates and junctions — stay put) to give `arteries`, the
// lines S7 sets buildings back from.

import {
  aStar,
  buildEdgeGraph,
  foldVerticesIntoCells,
  MERGE_QUANTUM,
  nearestNode,
  smoothPath,
  vertexKey
} from "./edgeGraph";
import { azimuthDelta, azimuthToVec, nearestOnPolyline, pointInPolygon, vecToAzimuth } from "./geom";
import { clampToWindow } from "./graphWalk";
import { close } from "./interior";
import { landwardFarNode } from "./plausibility";
import { SMALL_CITY_EXTENT_METERS } from "./settlementExtent";
import type { BorderLoop, Cell, CityGeography, Gate, Point, Precinct, StreetNetwork } from "./types";

/** How `farNodeFor` picks the extramural road's window-edge aim (Phase G2). */
export type FarNodeMode = "descriptorEnd" | "radial" | "manualBearings";

export interface StreetInputs {
  /** Junction-optimised interior cells — the same basis as `borders` / `gates`. */
  cells: Cell[];
  /** Ids of the S3 urban cells (the street graph's passable area). */
  urban: Set<number>;
  /** Ids of the S1 sea cells — a road may never step onto one of their vertices
   * (towngen-comparison.md §2.4 / §3.D: the "road across the bay" bug). */
  sea: Set<number>;
  /** Closed water polygon, same source as `sea`. Used to keep a road's far aim
   * point on dry land instead of straight out in open water. */
  waterPolygon: Point[] | null;
  borders: BorderLoop[];
  gates: Gate[];
  precincts: Precinct[];
  citadelOutline: Point[] | null;
  geo: CityGeography;
  cellSizeMeters: number;
  halfExtentMeters: number;
  /**
   * Walked river polylines (`walkRiver` `edgePoints`, not the smoothed
   * centreline). Consecutive pairs that match graph nodes are hard-barred for
   * streets and roads — never a `weight` multiplier, never exempted at
   * endpoints (Phase G7 / design §3.1). Omit or `[]` when there is no river.
   */
  rivers?: Point[][];
  /** Graph-walked shoreline, used with `avoidSea` to pull a wet far-aim onto land. */
  shoreline?: Point[] | null;
  /** Far-aim policy. Default `"descriptorEnd"`. */
  farNode?: FarNodeMode;
  /** Per-gate compass bearings when `farNode` is `"manualBearings"`. */
  manualBearings?: number[];
  /**
   * When true (the default), sea-cell vertices are a never-exempted hard bar
   * for roads, a wet far-aim is pulled onto the shoreline, and A* that still
   * returns null simply drops the road (Phase G2 / §3.E). Set false to restore
   * the historical "roads may cross the bay" behaviour for comparison.
   */
  avoidSea?: boolean;
}

/**
 * `StreetNetwork` plus the record of how far `tidyUpRoads` moved each interior
 * street vertex. `pipeline.ts` folds `vertexShifts` back into the cell polygons
 * so S6/S7 inset from de-zig-zagged edges — TownGeneratorTS 2.4 gets this for
 * free because its `smoothStreet` mutates the `Point`s it shares with the patch
 * polygons; our A* graph is a detached copy, so we replay the move.
 */
export interface StreetResult extends StreetNetwork {
  /** Original urban cell-vertex key → smoothed position. Keyed as
   * `foldArteriesIntoCells` re-keys the cell vertices. Intramural street runs
   * only; the extramural roads keep the raw line they are drawn with. */
  vertexShifts: Map<string, Point>;
}

const EMPTY: StreetResult = { streets: [], roads: [], arteries: [], vertexShifts: new Map() };

/** Pure. Same interior geometry ⇒ identical network (A* is deterministic; no RNG). */
export function buildStreets(input: StreetInputs): StreetResult {
  const {
    cells,
    urban,
    sea,
    waterPolygon,
    borders,
    gates,
    precincts,
    citadelOutline,
    geo,
    cellSizeMeters,
    halfExtentMeters,
    rivers: riverPolylines = [],
    shoreline = null,
    farNode = "descriptorEnd",
    manualBearings,
    avoidSea = true
  } = input;
  if (!gates.length || !cells.length) return EMPTY;

  const graph = buildEdgeGraph(cells);
  if (!graph.points.length) return EMPTY;

  const byId = new Map(cells.map(c => [c.id, c]));
  const citadelRing = citadelOutline && citadelOutline.length >= 3 ? close(citadelOutline) : null;

  // Node lookup keyed exactly as buildEdgeGraph merges its vertices.
  const nodeAt = new Map<string, number>();
  const qk = (p: Point): string => `${Math.round(p[0] / MERGE_QUANTUM)},${Math.round(p[1] / MERGE_QUANTUM)}`;
  for (let i = 0; i < graph.points.length; i++) nodeAt.set(qk(graph.points[i]), i);

  // Passable areas: streets run on vertices of `urban` cells; roads run on
  // vertices that are not urban. `borderNodes` are the wall-ring vertices — a
  // street is nudged (not barred) off them so it hugs the wall only where a
  // spur-shaped gate leaves it no interior vertex to step onto.
  const urbanNodes = new Set<number>();
  for (const c of cells) {
    if (!urban.has(c.id)) continue;
    for (const v of c.polygon) {
      const id = nodeAt.get(qk(v));
      if (id !== undefined) urbanNodes.add(id);
    }
  }
  const borderNodes = new Set<number>();
  for (const b of borders) {
    for (const p of b.points) {
      const id = nodeAt.get(qk(p));
      if (id !== undefined) borderNodes.add(id);
    }
  }
  // Sea-cell vertices — a road must never step onto one (§2.4 / §3.D).
  const seaNodes = new Set<number>();
  for (const c of cells) {
    if (!sea.has(c.id)) continue;
    for (const v of c.polygon) {
      const id = nodeAt.get(qk(v));
      if (id !== undefined) seaNodes.add(id);
    }
  }
  const crossesSea = (a: number, b: number): boolean => avoidSea && (seaNodes.has(a) || seaNodes.has(b));

  // River-walked graph edges. Keyed undirected so A* either direction is barred.
  // Mapping is the same MERGE_QUANTUM as `nodeAt` — `edgePoints` are graph vertices.
  const undirectedKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);
  const riverEdgeSet = new Set<string>();
  for (const line of riverPolylines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = nodeAt.get(qk(line[i]));
      const b = nodeAt.get(qk(line[i + 1]));
      if (a === undefined || b === undefined || a === b) continue;
      riverEdgeSet.add(undirectedKey(a, b));
    }
  }
  const onRiver = (a: number, b: number): boolean => riverEdgeSet.has(undirectedKey(a, b));

  /** `weight` returns a multiplier on the edge length: `Infinity` bars the edge,
   * `> 1` discourages it, `1` is neutral. Edges incident to the route's own
   * endpoints are exempt from `weight` (so a spur-shaped gate can still make its
   * first hop off a wall/border vertex). `hardBar`, when given, is a SEPARATE
   * never-exempted bar — for a constraint that must hold even on that first/last
   * hop (the citadel enceinte; a water body for D.1's road fix): without this,
   * a gate placed right at the edge of one lets the route's very first step
   * cross it, since it inherits the endpoint exemption meant for urban/wall
   * masking. See towngen-comparison.md — the citadel-crossing street this fixed. */
  const route = (
    from: Point,
    to: Point,
    weight: (a: number, b: number) => number,
    hardBar?: (a: number, b: number) => boolean
  ): Point[] | null => {
    const s = nearestNode(graph, from);
    const g = nearestNode(graph, to);
    if (s === g) return null;
    const ids = aStar(graph, s, g, (a, b, w) => {
      if (hardBar?.(a, b)) return Number.POSITIVE_INFINITY;
      return a === s || b === s || a === g || b === g ? w : w * weight(a, b);
    });
    if (!ids || ids.length < 2) return null;
    return ids.map(id => [graph.points[id][0], graph.points[id][1]] as Point);
  };

  const clearOfCitadel = (a: number, b: number): boolean => {
    if (!citadelRing) return true;
    const pa = graph.points[a];
    const pb = graph.points[b];
    return !pointInPolygon([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], citadelRing);
  };

  // --- streets: Tiny keeps gate → plaza; Small+ uses through-axes, ribs, ring
  const plaza = precincts.find(p => p.kind === "plaza");
  const plazaPolys: Point[][] = (plaza?.cellIds ?? []).flatMap(id => (byId.has(id) ? [byId.get(id)!.polygon] : []));
  const plazaVertices: Point[] = [];
  for (const poly of plazaPolys) for (const v of poly) plazaVertices.push(v);
  const streetTarget: Point = plazaVertices
    .slice()
    .sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]))[0] ?? [0, 0];

  const streetWeight = (a: number, b: number): number => {
    if (!(urbanNodes.has(a) && urbanNodes.has(b))) return Number.POSITIVE_INFINITY;
    return borderNodes.has(a) || borderNodes.has(b) ? 1.6 : 1;
  };
  const ringWeight = (a: number, b: number): number => {
    if (!(urbanNodes.has(a) && urbanNodes.has(b))) return Number.POSITIVE_INFINITY;
    if (borderNodes.has(a) && borderNodes.has(b)) return 0.45;
    if (borderNodes.has(a) || borderNodes.has(b)) return 0.75;
    return 2.2;
  };
  const crossesCitadel = (a: number, b: number): boolean => !clearOfCitadel(a, b);
  const streetsHardBar = (a: number, b: number): boolean => crossesCitadel(a, b) || onRiver(a, b);
  const streets: Point[][] = [];
  const addStreet = (line: Point[] | null): boolean => {
    if (!line || line.length < 2) return false;
    if (streets.some(existing => sameCorridor(existing, line))) return false;
    streets.push(line);
    return true;
  };
  const tiny = halfExtentMeters * 2 < SMALL_CITY_EXTENT_METERS;
  for (const gate of gates) addStreet(route(gate.point, streetTarget, streetWeight, streetsHardBar));
  if (!tiny && gates.length >= 2) {
    const pairs = oppositeGatePairs(gates, streetTarget);
    const axes: Point[][] = [];
    for (const [a, b] of pairs) {
      const line = route(a.point, b.point, streetWeight, streetsHardBar);
      if (addStreet(line) && line) axes.push(line);
    }
    const used = new Set(pairs.flat());
    for (const gate of gates) {
      if (used.has(gate)) continue;
      const hitch = nearestOnStreets(gate.point, axes.length ? axes : streets);
      if (hitch && Math.hypot(hitch[0] - streetTarget[0], hitch[1] - streetTarget[1]) > cellSizeMeters)
        addStreet(route(gate.point, hitch, streetWeight, streetsHardBar));
    }
    const span = urbanSpan(cells, urban);
    const spacing = Math.max(50, Math.min(80, cellSizeMeters * 1.4));
    const offsets = Math.min(2, Math.max(0, Math.floor(span / (2 * spacing))));
    for (const axis of axes) {
      const start = axis[0],
        end = axis[axis.length - 1];
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (length < spacing * 2) continue;
      const tangent: Point = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
      const normal: Point = [-tangent[1], tangent[0]];
      const origin = dot(start, normal);
      const corridor = (offset: number) => {
        const a: number = origin + offset;
        return (u: number, v: number): number => {
          if (!(urbanNodes.has(u) && urbanNodes.has(v))) return Number.POSITIVE_INFINITY;
          const mid: Point = [
            (graph.points[u][0] + graph.points[v][0]) / 2,
            (graph.points[u][1] + graph.points[v][1]) / 2
          ];
          const d = Math.abs(dot(mid, normal) - a);
          return 1 + (d / spacing) ** 2;
        };
      };
      for (let k = 1; k <= offsets; k++) {
        for (const sign of [-1, 1]) {
          const offset = sign * k * spacing;
          const ends = urbanChordEnds(graph, urbanNodes, borderNodes, tangent, normal, origin + offset, spacing * 0.45);
          if (!ends || Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]) < spacing * 1.6) continue;
          const line = route(ends[0], ends[1], corridor(offset), streetsHardBar);
          if (!line || pathFollowsExisting(line, streets, spacing * 0.45)) continue;
          addStreet(line);
        }
      }
    }
    if (!riverPolylines.length) {
      for (const [from, to] of consecutiveGates(gates, borders)) {
        if (pairs.some(([a, b]) => sameEnds(from.point, to.point, a.point, b.point))) continue;
        addStreet(route(from.point, to.point, ringWeight, streetsHardBar));
      }
    }
  }

  // --- roads: window edge → land gate. A road may not enter the built-up area
  // (`urban`) — "outside the wall" follows because the wall wraps it — or step
  // on a sea-cell vertex (§2.4 / §3.D: this used to let a landward road cut
  // straight across a bay). Routing stops one step outside the gate (its own
  // vertex is shared with urban cells, so A* can't peel off it) and a short
  // radial stub closes onto the gate.
  const nonUrban = (a: number, b: number): number =>
    urbanNodes.has(a) || urbanNodes.has(b) ? Number.POSITIVE_INFINITY : 1;
  const roadsHardBar = (a: number, b: number): boolean => crossesSea(a, b) || onRiver(a, b);
  const roads: Point[][] = [];
  for (let gi = 0; gi < gates.length; gi++) {
    const gate = gates[gi];
    if (gate.water) continue;
    const out = unit(gate.point);
    const apron = clampToWindow(
      [gate.point[0] + out[0] * cellSizeMeters * 1.2, gate.point[1] + out[1] * cellSizeMeters * 1.2],
      halfExtentMeters
    );
    const apronNode = nearestNode(graph, apron);
    if (urbanNodes.has(apronNode) || (avoidSea && seaNodes.has(apronNode))) continue;
    const goal = farNodeFor(
      gate,
      geo,
      halfExtentMeters,
      waterPolygon,
      shoreline,
      cellSizeMeters,
      avoidSea,
      farNode,
      manualBearings?.[gi]
    );
    const legs = route(goal, graph.points[apronNode], nonUrban, roadsHardBar);
    if (!legs) continue;
    // The radial stub onto the gate is not an A* hop — bar it separately so a
    // river along the wall cannot become the road's first edge, and so a shore
    // gate does not grow a last hop across the water (Phase G2).
    const gateNode = nearestNode(graph, gate.point);
    const apronPt = graph.points[apronNode];
    const stubMid: Point = [(apronPt[0] + gate.point[0]) / 2, (apronPt[1] + gate.point[1]) / 2];
    const stubWet = avoidSea && waterPolygon && waterPolygon.length >= 3 && pointInPolygon(stubMid, waterPolygon);
    const line = onRiver(apronNode, gateNode) || stubWet ? legs : [...legs, [gate.point[0], gate.point[1]] as Point];
    roads.push(line);
  }

  const arteries = buildArteries([...streets, ...roads], plazaPolys, cellSizeMeters).arteries;
  // Fold ONLY the intramural street runs back into the fabric: they are masked to
  // `urban` nodes, so every shifted key is an urban cell vertex, and the roads —
  // which are drawn from their raw line — stay put beside the rural blocks.
  const vertexShifts = buildArteries(streets, plazaPolys, cellSizeMeters).vertexShifts;
  return { streets, roads, arteries, vertexShifts };
}

/**
 * TownGenerator's `tidyUpRoads`: break the union of streets + roads into cell
 * edges, drop those that bound the plaza, reconnect the rest into runs that stop
 * at every junction / dead end, and smooth each run's interior (its endpoints —
 * gates and junctions — are held fixed).
 */
export function tidyUpRoads(chains: Point[][], plazaPolys: Point[][], cellSize: number): Point[][] {
  return buildArteries(chains, plazaPolys, cellSize).arteries;
}

/**
 * `tidyUpRoads` plus the record of where each interior vertex moved: `key(raw) →
 * smoothed`. Endpoints (gates / junctions) are held fixed and never recorded, so
 * every entry is a genuine displacement `pipeline.ts` can fold into the cells.
 */
function buildArteries(
  chains: Point[][],
  plazaPolys: Point[][],
  cellSize: number
): { arteries: Point[][]; vertexShifts: Map<string, Point> } {
  const key = vertexKey;
  const coord = new Map<string, Point>();
  const adjacency = new Map<string, Set<string>>();
  const plazaRings = plazaPolys.map(poly => close(poly));
  const isPlazaEdge = (a: Point, b: Point): boolean => {
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (plazaRings.some(r => pointInPolygon(mid, r))) return true;
    return plazaRings.some(r => onRing(a, r, cellSize) && onRing(b, r, cellSize));
  };

  for (const chain of chains) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = chain[i];
      const b = chain[i + 1];
      const ka = key(a);
      const kb = key(b);
      if (ka === kb) continue;
      coord.set(ka, [a[0], a[1]]);
      coord.set(kb, [b[0], b[1]]);
      if (isPlazaEdge(a, b)) continue;
      link(adjacency, ka, kb);
      link(adjacency, kb, ka);
    }
  }

  const segId = (a: string, b: string): string => (a < b ? `${a}~${b}` : `${b}~${a}`);
  const used = new Set<string>();
  const arteries: Point[][] = [];
  const vertexShifts = new Map<string, Point>();
  const walk = (start: string, first: string): void => {
    if (used.has(segId(start, first))) return;
    const line: Point[] = [coord.get(start) as Point];
    let prev = start;
    let cur = first;
    for (let guard = 0; guard < 100_000; guard++) {
      used.add(segId(prev, cur));
      line.push(coord.get(cur) as Point);
      const onward = [...(adjacency.get(cur) ?? [])].filter(k => k !== prev && !used.has(segId(cur, k)));
      if ((adjacency.get(cur)?.size ?? 0) === 2 && onward.length === 1) {
        prev = cur;
        cur = onward[0];
      } else break;
    }
    if (line.length >= 3) {
      const smoothed = smoothPath(line, 2);
      for (let i = 1; i + 1 < line.length; i++) vertexShifts.set(key(line[i]), smoothed[i]);
      arteries.push(smoothed);
    } else {
      arteries.push(line.map(p => [p[0], p[1]] as Point));
    }
  };

  // Runs anchored at every non-degree-2 node (gates, junctions, dead ends)…
  for (const node of adjacency.keys()) {
    if ((adjacency.get(node)?.size ?? 0) === 2) continue;
    for (const next of adjacency.get(node) ?? []) walk(node, next);
  }
  // …then any leftover all-degree-2 cycle, seeded from an unused edge.
  for (const [node, neighbours] of adjacency) {
    for (const next of neighbours) if (!used.has(segId(node, next))) walk(node, next);
  }
  return { arteries, vertexShifts };
}

/**
 * Vertex keys the artery fold must not move: the perimeter ring, the citadel
 * enceinte and the gates. Keyed exactly as `foldArteriesIntoCells` re-keys the
 * cell vertices, so a cell vertex sitting on any of them stays pinned and the
 * wall / citadel overlays keep touching the fabric.
 */
export function reservedStreetVertices(
  borders: BorderLoop[],
  citadelOutline: Point[] | null,
  gates: Gate[]
): Set<string> {
  const set = new Set<string>();
  const add = (p: Point): void => {
    set.add(vertexKey(p));
  };
  for (const b of borders) for (const p of b.points) add(p);
  if (citadelOutline) for (const p of citadelOutline) add(p);
  for (const g of gates) add(g.point);
  return set;
}

/**
 * Replay TownGeneratorTS 2.4's `smoothStreet` on our detached grid. There it
 * writes the smoothed coordinates straight into the `Point` objects it shares
 * with the patch polygons, so 2.6 insets from straightened edges; here the A*
 * graph is a copy, so we move the matching cell vertices onto the smoothed
 * street ourselves. `reserved` keys are pinned; cells with no street vertex —
 * and the whole array when nothing moves — are returned by reference so the
 * pre-S5 snapshots stay on the raw junction-optimised grid.
 */
export function foldArteriesIntoCells(cells: Cell[], vertexShifts: Map<string, Point>, reserved: Set<string>): Cell[] {
  return foldVerticesIntoCells(cells, vertexShifts, reserved);
}

const near = (a: Point, b: Point, limit = 8): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < limit;
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1];

function sameEnds(a0: Point, a1: Point, b0: Point, b1: Point): boolean {
  return (near(a0, b0) && near(a1, b1)) || (near(a0, b1) && near(a1, b0));
}

function sameCorridor(a: Point[], b: Point[]): boolean {
  return sameEnds(a[0], a[a.length - 1], b[0], b[b.length - 1]);
}

function oppositeGatePairs(gates: Gate[], plaza: Point): [Gate, Gate][] {
  if (gates.length < 2) return [];
  const az = (g: Gate) => vecToAzimuth(g.point[0] - plaza[0], g.point[1] - plaza[1]);
  const used = new Set<Gate>();
  const pairs: [Gate, Gate][] = [];
  const axisAz = (pair: [Gate, Gate]) =>
    vecToAzimuth(pair[1].point[0] - pair[0].point[0], pair[1].point[1] - pair[0].point[1]);
  while (pairs.length < 2) {
    let best: [Gate, Gate] | null = null;
    let bestScore = 0;
    for (let i = 0; i < gates.length; i++) {
      if (used.has(gates[i])) continue;
      for (let j = i + 1; j < gates.length; j++) {
        if (used.has(gates[j])) continue;
        const opposite = 1 - Math.abs(azimuthDelta(az(gates[i]), az(gates[j])) - 180) / 180;
        if (opposite < 0.4) continue;
        if (pairs.length === 1) {
          const turn = azimuthDelta(axisAz(pairs[0]), axisAz([gates[i], gates[j]]));
          if (turn < 50 || turn > 130) continue;
        }
        const dist = Math.hypot(gates[i].point[0] - gates[j].point[0], gates[i].point[1] - gates[j].point[1]);
        const score = opposite * dist;
        if (score > bestScore) {
          bestScore = score;
          best = [gates[i], gates[j]];
        }
      }
    }
    if (!best) break;
    pairs.push(best);
    used.add(best[0]);
    used.add(best[1]);
  }
  return pairs;
}

function consecutiveGates(gates: Gate[], borders: BorderLoop[]): [Gate, Gate][] {
  const pairs: [Gate, Gate][] = [];
  for (let borderIndex = 0; borderIndex < borders.length; borderIndex++) {
    const loop = borders[borderIndex];
    if (loop.points.length < 3) continue;
    const closed = [...loop.points, loop.points[0]];
    const members = gates.filter(g => g.borderIndex === borderIndex);
    if (members.length < 2) continue;
    const ordered = members
      .map(g => ({ g, hit: nearestOnPolyline(g.point, closed) }))
      .sort((a, b) => a.hit.segIndex + a.hit.t - (b.hit.segIndex + b.hit.t))
      .map(item => item.g);
    for (let i = 0; i < ordered.length; i++) pairs.push([ordered[i], ordered[(i + 1) % ordered.length]]);
  }
  return pairs;
}

function urbanSpan(cells: Cell[], urban: Set<number>): number {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const cell of cells) {
    if (!urban.has(cell.id)) continue;
    for (const [x, y] of cell.polygon) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return 0;
  return Math.max(maxX - minX, maxY - minY);
}

function urbanChordEnds(
  graph: { points: Point[] },
  urbanNodes: Set<number>,
  borderNodes: Set<number>,
  tangent: Point,
  normal: Point,
  offset: number,
  bandwidth: number
): [Point, Point] | null {
  let minAlong = Infinity,
    maxAlong = -Infinity;
  let minPt: Point | null = null,
    maxPt: Point | null = null;
  for (const id of urbanNodes) {
    if (borderNodes.has(id)) continue;
    const p = graph.points[id];
    if (Math.abs(dot(p, normal) - offset) > bandwidth) continue;
    const along = dot(p, tangent);
    if (along < minAlong) {
      minAlong = along;
      minPt = p;
    }
    if (along > maxAlong) {
      maxAlong = along;
      maxPt = p;
    }
  }
  return minPt && maxPt && minPt !== maxPt ? [minPt, maxPt] : null;
}

function nearestOnStreets(p: Point, streets: Point[][]): Point | null {
  let best: Point | null = null,
    bestDist = Infinity;
  for (const street of streets) {
    const hit = nearestOnPolyline(p, street);
    if (hit.dist < bestDist) {
      best = hit.point;
      bestDist = hit.dist;
    }
  }
  return best;
}

function pathFollowsExisting(line: Point[], streets: Point[][], limit: number): boolean {
  if (line.length < 2 || !streets.length) return false;
  let near = 0;
  for (const p of line) {
    if (streets.some(street => nearestOnPolyline(p, street).dist < limit)) near++;
  }
  return near / line.length > 0.55;
}

function link(adjacency: Map<string, Set<string>>, from: string, to: string): void {
  let set = adjacency.get(from);
  if (!set) {
    set = new Set();
    adjacency.set(from, set);
  }
  set.add(to);
}

/**
 * A far aim point in the gate's bearing, clamped to the window.
 *
 * - `descriptorEnd` (default): the descriptor road whose entry azimuth matches
 *   the gate, else straight out along the gate's own radius.
 * - `radial`: always along the gate's radius.
 * - `manualBearings`: the caller-supplied compass bearing, else radial.
 *
 * When `avoidSea` is on and that aim lands in the water, replace it with the
 * `goal→gate` × shoreline intersection, one `cellSize` landward (§3.E.1).
 */
export function farNodeFor(
  gate: Gate,
  geo: CityGeography,
  half: number,
  waterPolygon: Point[] | null,
  shoreline: Point[] | null,
  cellSize: number,
  avoidSea: boolean,
  mode: FarNodeMode,
  manualBearing: number | undefined
): Point {
  const gateAz = vecToAzimuth(gate.point[0], gate.point[1]);
  let dir: Point;
  if (mode === "radial") {
    dir = unit(gate.point);
  } else if (mode === "manualBearings" && manualBearing != null && Number.isFinite(manualBearing)) {
    dir = azimuthToVec(manualBearing);
  } else {
    const best = (geo.roadPaths ?? [])
      .filter(p => p.length >= 2)
      .map(p => ({ end: p[p.length - 1], az: vecToAzimuth(p[p.length - 1][0], p[p.length - 1][1]) }))
      .sort((a, b) => azimuthDelta(a.az, gateAz) - azimuthDelta(b.az, gateAz))[0];
    dir = best && azimuthDelta(best.az, gateAz) < 45 ? unit(best.end) : unit(gate.point);
  }
  const m = half * 0.985;
  const reach = half * 1.6;
  const clamp = (p: Point): Point => [Math.max(-m, Math.min(m, p[0])), Math.max(-m, Math.min(m, p[1]))];
  const raw: Point = [gate.point[0] + dir[0] * reach, gate.point[1] + dir[1] * reach];
  if (!avoidSea) return clamp(raw);
  return landwardFarNode(gate.point, raw, waterPolygon, shoreline, cellSize, clamp);
}

function unit(p: Point): Point {
  const len = Math.hypot(p[0], p[1]);
  return len < 1e-6 ? [0, 1] : [p[0] / len, p[1] / len];
}

function onRing(p: Point, ring: Point[], cellSize: number): boolean {
  return nearestOnPolyline(p, ring).dist < cellSize * 0.15;
}
