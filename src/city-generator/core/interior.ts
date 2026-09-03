// S4 — inner perimeter, gates, and the two pre-street precincts.  The border is
// extracted from the same Voronoi polygons as every other city feature: no
// secondary wall geometry is invented here. The wall PATTERN (which area to
// enclose, how to draw the line, whether to wall the sea front) is a separate
// layer — see docs/city-generator/wall-patterns.md.

import {
  azimuthDelta,
  azimuthToVec,
  convexHull,
  nearestOnPolyline,
  perpDistanceToLine,
  pointInPolygon,
  polygonArea,
  polylineLength,
  simplifyPolyline,
  vecToAzimuth
} from "./geom";
import type {
  BorderLoop,
  Cell,
  CityGeography,
  CityParams,
  CityProgram,
  Gate,
  Overlay,
  Point,
  Precinct,
  WallPlan,
  WallSegmentKind
} from "./types";

const QUANTUM = 0.05;

interface DirectedEdge {
  a: Point;
  b: Point;
  aKey: string;
  bKey: string;
}

/**
 * Merge tiny Voronoi edges before deriving the perimeter. This is the small,
 * topology-preserving part of TownGenerator's optimizeJunctions: endpoints of
 * every edge shorter than cellSize / 6 become one shared midpoint, then duplicate
 * consecutive vertices are removed. It returns new cells so earlier snapshots
 * remain immutable inspection records.
 */
export function optimizeJunctions(cells: Cell[], cellSize: number): Cell[] {
  const points = new Map<string, Point>();
  const links = new Map<string, Set<string>>();
  const keyOf = (p: Point): string => `${Math.round(p[0] / QUANTUM)},${Math.round(p[1] / QUANTUM)}`;
  const add = (p: Point): string => {
    const key = keyOf(p);
    if (!points.has(key)) points.set(key, [p[0], p[1]]);
    return key;
  };
  for (const cell of cells) {
    for (let i = 0; i < cell.polygon.length; i++) {
      const a = cell.polygon[i];
      const b = cell.polygon[(i + 1) % cell.polygon.length];
      const ak = add(a);
      const bk = add(b);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= cellSize / 6 || ak === bk) continue;
      (links.get(ak) ?? links.set(ak, new Set()).get(ak)!).add(bk);
      (links.get(bk) ?? links.set(bk, new Set()).get(bk)!).add(ak);
    }
  }

  const replacement = new Map<string, Point>();
  const seen = new Set<string>();
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const group: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const key = queue.pop() as string;
      group.push(key);
      for (const next of links.get(key) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const mean: Point = group.reduce<Point>(
      (sum, key) => [sum[0] + points.get(key)![0], sum[1] + points.get(key)![1]],
      [0, 0]
    );
    mean[0] /= group.length;
    mean[1] /= group.length;
    for (const key of group) replacement.set(key, mean);
  }

  return cells.map(cell => {
    const polygon: Point[] = [];
    for (const p of cell.polygon) {
      const q = replacement.get(keyOf(p)) ?? p;
      const last = polygon[polygon.length - 1];
      if (!last || Math.hypot(last[0] - q[0], last[1] - q[1]) > 1e-5) polygon.push([q[0], q[1]]);
    }
    if (polygon.length > 2 && Math.hypot(polygon[0][0] - polygon.at(-1)![0], polygon[0][1] - polygon.at(-1)![1]) < 1e-5)
      polygon.pop();
    return { ...cell, polygon: polygon.length >= 3 ? polygon : cell.polygon.map(p => [p[0], p[1]] as Point) };
  });
}

/** Find an outer, closed circumference for every connected urban component. */
export function buildBorders(cells: Cell[], urban: Set<number>): BorderLoop[] {
  const byId = new Map(cells.map(c => [c.id, c]));
  const unseen = new Set(urban);
  const out: BorderLoop[] = [];
  while (unseen.size) {
    const start = unseen.values().next().value as number;
    const ids = new Set<number>([start]);
    const queue = [start];
    unseen.delete(start);
    while (queue.length) {
      const id = queue.pop() as number;
      for (const next of byId.get(id)?.neighbors ?? []) {
        if (unseen.delete(next)) {
          ids.add(next);
          queue.push(next);
        }
      }
    }
    out.push(
      ...componentBorders(
        cells.filter(c => ids.has(c.id)),
        [...ids]
      )
    );
  }
  return out;
}

function componentBorders(cells: Cell[], urbanCellIds: number[]): BorderLoop[] {
  const occurrences = new Map<string, DirectedEdge[]>();
  const key = (p: Point): string => `${Math.round(p[0] / QUANTUM)},${Math.round(p[1] / QUANTUM)}`;
  for (const cell of cells) {
    const poly = polygonArea(cell.polygon) < 0 ? [...cell.polygon].reverse() : cell.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const aKey = key(a);
      const bKey = key(b);
      const undirected = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
      const list = occurrences.get(undirected) ?? [];
      list.push({ a, b, aKey, bKey });
      occurrences.set(undirected, list);
    }
  }
  const edges = [...occurrences.values()].filter(es => es.length === 1).map(es => es[0]);
  const from = new Map<string, DirectedEdge[]>();
  for (const edge of edges) (from.get(edge.aKey) ?? from.set(edge.aKey, []).get(edge.aKey)!).push(edge);
  const unused = new Set(edges);
  const loops: BorderLoop[] = [];
  while (unused.size) {
    const first = unused.values().next().value as DirectedEdge;
    const points: Point[] = [[first.a[0], first.a[1]]];
    let edge = first;
    let guard = edges.length + 2;
    while (guard-- > 0) {
      unused.delete(edge);
      points.push([edge.b[0], edge.b[1]]);
      if (edge.bKey === first.aKey) break;
      const choices = (from.get(edge.bKey) ?? []).filter(e => unused.has(e));
      if (!choices.length) break;
      edge = nextEdge(edge, choices);
    }
    if (points.length >= 4 && sameKey(points[0], points.at(-1)!)) {
      points.pop();
      if (Math.abs(polygonArea(points)) > 1e-4) {
        loops.push({ points, segments: points.map(() => "land" as WallSegmentKind), urbanCellIds });
      }
    }
  }
  // A connected component has exactly one outer circumference (design §4.2 /
  // burg-feature-options §5). Any extra loops are enclosed holes or pinch-point
  // lobes — keep only the largest-area ring so the wall wraps the whole town.
  if (loops.length <= 1) return loops;
  return [loops.reduce((a, b) => (Math.abs(polygonArea(a.points)) >= Math.abs(polygonArea(b.points)) ? a : b))];
}

/** Keep urban material on the left: at a junction take the smallest left turn. */
function nextEdge(previous: DirectedEdge, choices: DirectedEdge[]): DirectedEdge {
  const angle = Math.atan2(previous.b[1] - previous.a[1], previous.b[0] - previous.a[0]);
  return choices.slice().sort((a, b) => turn(angle, a) - turn(angle, b) || a.bKey.localeCompare(b.bKey))[0];
}

function turn(from: number, edge: DirectedEdge): number {
  const next = Math.atan2(edge.b[1] - edge.a[1], edge.b[0] - edge.a[0]);
  return (next - from + Math.PI * 2) % (Math.PI * 2);
}

function sameKey(a: Point, b: Point): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < QUANTUM;
}

/**
 * TownGeneratorTS only opens a gate onto a block CORNER — a wall vertex where
 * two or more urban patches actually meet (`CurtainWall.entrances`) — never
 * onto the middle of a straight run, and takes noticeably fewer of them than
 * FMG's road count suggests. `placeGates` follows the same shape (design
 * towngen-comparison.md §3.B): corner candidates, a target count DERIVED from
 * (not equal to) `suggestedGates`, and greedy bearing-match selection that
 * thins out anything too close, along the wall, to an already-chosen gate.
 */
export function placeGates(cells: Cell[], urban: Set<number>, borders: BorderLoop[], geo: CityGeography): Gate[] {
  if (!borders.length) return [];

  // A block corner: >= 2 urban cells share this wall vertex (a Voronoi vertex
  // is usually shared by 3 cells; 1 urban neighbour means the wall just runs
  // past it straight, 2+ means urban territory itself turns a corner there).
  const cornerVotes = new Map<string, number>();
  const qk = (p: Point): string => `${Math.round(p[0] / QUANTUM)},${Math.round(p[1] / QUANTUM)}`;
  for (const cell of cells) {
    if (!urban.has(cell.id)) continue;
    for (const v of cell.polygon) cornerVotes.set(qk(v), (cornerVotes.get(qk(v)) ?? 0) + 1);
  }

  interface Candidate {
    point: Point;
    borderIndex: number;
    arc: number;
  }
  const loopLength = borders.map(b => polylineLength([...b.points, b.points[0]]));
  const perLoop: Candidate[][] = borders.map((border, borderIndex) => {
    const arcs = cumulativeArcLengths(border.points);
    const all = border.points.map((point, i) => ({ point, borderIndex, arc: arcs[i] }));
    const corners = all.filter(c => (cornerVotes.get(qk(c.point)) ?? 0) >= 2);
    // A border too simple to have any real corner (rare, tiny blobs) falls
    // back to every vertex rather than producing zero gates.
    return corners.length >= 3 ? corners : all;
  });
  let pool: Candidate[] = ([] as Candidate[]).concat(...perLoop);
  if (!pool.length) return [];

  const wet = !!geo.coast || (geo.waterAreas?.length ?? 0) > 0 || geo.rivers.length > 0;
  const suggested = geo.suggestedGates ?? geo.roadBearings.length;
  const target = Math.max(3, Math.min(6, Math.round(suggested * 0.7))) + (wet ? 1 : 0);

  const bearings = geo.roadPaths?.filter(p => p.length >= 2).map(p => vecToAzimuth(p.at(-1)![0], p.at(-1)![1])) ?? [];
  const targets = bearings.length ? bearings : geo.roadBearings;

  const gates: Gate[] = [];
  for (let i = 0; i < target && pool.length; i++) {
    const bearing = targets.length ? targets[i % targets.length] : (i * 360) / target;
    const byBearingMatch = (a: Candidate, b: Candidate): number => {
      const ad = azimuthDelta(vecToAzimuth(a.point[0], a.point[1]), bearing);
      const bd = azimuthDelta(vecToAzimuth(b.point[0], b.point[1]), bearing);
      return ad - bd || Math.hypot(a.point[0], a.point[1]) - Math.hypot(b.point[0], b.point[1]);
    };
    const choice = pool.slice().sort(byBearingMatch)[0];
    gates.push({ point: choice.point, borderIndex: choice.borderIndex, water: false });
    // Thin out anything within one gate-spacing of the one just chosen, along
    // the SAME loop (TownGen's splice-out-the-neighbours step), so gates don't
    // bunch up when two candidate corners happen to share a bearing.
    const spacing = loopLength[choice.borderIndex] / (target + 1);
    pool = pool.filter(
      c =>
        c.borderIndex !== choice.borderIndex ||
        circularArcDelta(c.arc, choice.arc, loopLength[choice.borderIndex]) >= spacing
    );
  }
  return gates;
}

/** `points[i]`'s distance along the OPEN polyline from `points[0]`. */
function cumulativeArcLengths(points: Point[]): number[] {
  const arcs = [0];
  for (let i = 1; i < points.length; i++) {
    arcs.push(arcs[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  return arcs;
}

/** Shortest distance between two arc positions on a closed loop of length `loopLength`. */
function circularArcDelta(a: number, b: number, loopLength: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, loopLength - d);
}

export function placePrecincts(
  cells: Cell[],
  urban: Set<number>,
  sea: Set<number>,
  borders: BorderLoop[],
  geo: CityGeography,
  params: CityParams,
  program: CityProgram,
  rivers: Point[][]
): Precinct[] {
  const precincts: Precinct[] = [];
  const R = params.cityRadiusMeters;
  const cellSize = params.cellSizeMeters;
  const urbanCells = cells.filter(c => urban.has(c.id));
  let plazaCell: Cell | null = null;
  if (program.plaza) {
    const candidates = urbanCells.filter(c => Math.hypot(...c.centroid) <= R * 0.28);
    const pick = (candidates.length ? candidates : urbanCells)
      .slice()
      .sort((a, b) => plazaScore(a, geo) - plazaScore(b, geo) || a.id - b.id)[0];
    if (pick) {
      plazaCell = pick;
      // A capital's market square spreads onto one neighbouring urban cell (design §4.3).
      const extra = program.capital ? pick.neighbors.find(n => urban.has(n)) : undefined;
      const cellIds = extra === undefined ? [pick.id] : [pick.id, extra];
      precincts.push({ kind: "plaza", cellIds, anchor: pick.centroid, label: "Market square" });
    }
  }
  if (program.citadel) {
    const urbanById = new Map(urbanCells.map(c => [c.id, c]));
    const borderUrban = new Set(borders.flatMap(b => b.urbanCellIds));
    const outer = cells.filter(c => !urban.has(c.id) && !sea.has(c.id) && c.neighbors.some(n => borderUrban.has(n)));
    const pool = outer.length ? outer : urbanCells.filter(c => c.neighbors.some(n => !urbanById.has(n)));
    const pick = pool
      .filter(c => c.id !== plazaCell?.id)
      .slice()
      .sort(
        (a, b) =>
          citadelScore(b, R, cellSize, geo, rivers, plazaCell) - citadelScore(a, R, cellSize, geo, rivers, plazaCell) ||
          a.id - b.id
      )[0];
    if (pick) {
      // The keep is the cell PLUS its ring of neighbours (the enceinte): 5–9 cells
      // total, dropping any that fell in the water (design §4.2).
      const cellIds = [pick.id, ...pick.neighbors.filter(n => !sea.has(n))];
      precincts.push({ kind: "citadel", cellIds, anchor: pick.centroid, label: "Citadel" });
    }
  }
  return precincts;
}

function plazaScore(cell: Cell, geo: CityGeography): number {
  const az = vecToAzimuth(cell.centroid[0], cell.centroid[1]);
  const aligned = geo.roadBearings.filter(b => azimuthDelta(az, b) <= 22).length;
  return Math.hypot(...cell.centroid) - aligned * 40;
}

/** Circular mean of compass bearings; null when there are none. */
function meanBearing(bearings: number[]): number | null {
  if (!bearings.length) return null;
  let x = 0;
  let y = 0;
  for (const b of bearings) {
    const v = azimuthToVec(b);
    x += v[0];
    y += v[1];
  }
  return x === 0 && y === 0 ? null : vecToAzimuth(x, y);
}

/**
 * Score a citadel candidate by the design §4.2 table. Border-adjacency and the
 * `>= 0.15R` floor are already enforced by the caller's candidate pool; here we
 * add the positional preferences. (The +2.0 "local elevation maximum" term still
 * needs the terrain heightfield plumbed through — see design §12.3 — so it is not
 * yet applied.)
 */
function citadelScore(
  cell: Cell,
  R: number,
  cellSize: number,
  geo: CityGeography,
  rivers: Point[][],
  plaza: Cell | null
): number {
  const [x, y] = cell.centroid;
  const distance = Math.hypot(x, y);
  let score = distance >= R * 0.15 ? 0 : -1000; // never sits dead-centre
  // +1.0 — faces inland: away from the sea, or from the mean road bearing inland.
  const inlandRef = geo.coast ? (geo.coast.waterAzimuthDeg + 180) % 360 : meanBearing(geo.roadBearings);
  if (inlandRef !== null && azimuthDelta(vecToAzimuth(x, y), inlandRef) <= 35) score += 1;
  // +1.5 — backs onto a river (a natural moat).
  const nearRiver = rivers.some(line => line.some(v => Math.hypot(v[0] - x, v[1] - y) <= cellSize * 1.2));
  if (nearRiver) score += 1.5;
  // -1.0 — crowds the market square (within ~2 cells).
  if (plaza && Math.hypot(plaza.centroid[0] - x, plaza.centroid[1] - y) <= cellSize * 2) score -= 1;
  return score;
}

/**
 * The water gate sits where the perimeter comes closest to the sea (design §4.5).
 * To keep the gate count at `suggestedGates` we relocate the nearest existing gate
 * onto that point rather than adding one.
 */
export function markWaterGate(gates: Gate[], borders: BorderLoop[], shoreline: Point[] | null, port: boolean): Gate[] {
  if (!port || !shoreline || !gates.length) return gates;
  let target: Point | null = null;
  let targetBorder = 0;
  let bestToSea = Number.POSITIVE_INFINITY;
  borders.forEach((border, bi) => {
    for (const p of border.points) {
      const d = nearestOnPolyline(p, shoreline).dist;
      if (d < bestToSea) {
        bestToSea = d;
        target = p;
        targetBorder = bi;
      }
    }
  });
  if (!target) return gates;
  const anchor = target as Point;
  let move = 0;
  let bestToAnchor = Number.POSITIVE_INFINITY;
  gates.forEach((gate, i) => {
    const d = Math.hypot(gate.point[0] - anchor[0], gate.point[1] - anchor[1]);
    if (d < bestToAnchor) {
      bestToAnchor = d;
      move = i;
    }
  });
  return gates.map((gate, i) =>
    i === move ? { point: anchor, borderIndex: targetBorder, water: true } : { ...gate, water: false }
  );
}

/**
 * A "land" gate whose immediate surroundings are entirely water (a spit, a
 * narrow neck the wall trace clips across) cannot actually lead anywhere on
 * foot — reclassify it as a water gate regardless of `port` (§2.5 / §3.D.4).
 * Independent of `markWaterGate`, which only ever promotes ONE gate and only
 * when `port` is set; this is a plain geometric correction, so it can apply to
 * more than one gate, or none.
 */
export function markSeaSurroundedGates(gates: Gate[], waterPolygon: Point[] | null, cellSizeMeters: number): Gate[] {
  if (!waterPolygon || waterPolygon.length < 3 || !gates.length) return gates;
  const reach = cellSizeMeters * 1.5;
  const seaSurrounded = (point: Point): boolean => {
    for (let a = 0; a < 8; a++) {
      const rad = (a / 8) * Math.PI * 2;
      const probe: Point = [point[0] + Math.cos(rad) * reach, point[1] + Math.sin(rad) * reach];
      if (!pointInPolygon(probe, waterPolygon)) return false;
    }
    return true;
  };
  return gates.map(gate => (gate.water || !seaSurrounded(gate.point) ? gate : { ...gate, water: true }));
}

// --- wall pattern (docs/city-generator/wall-patterns.md) --------------------

/** Close a ring for drawing: append the first point. */
export function close(points: Point[]): Point[] {
  return points.length ? [...points, points[0]] : [];
}

/**
 * Reshape a traced circumference into the wall ENVELOPE per `plan.envelope`. The
 * result is always a superset of the traced loop (pockets are bridged outward),
 * so it still contains every interior urban cell. `segments` is reset — the
 * caller classifies it afterwards. See wall-patterns.md §2.
 *
 * `hull` — convex hull of the traced vertices (already grid points).
 * `notchFilled` — the trace, but any inward pocket deeper than
 *   `notchDepth · cellSize` between two hull vertices is replaced by the chord.
 * `sectorPolygon` / `denseCore` / `expanded` fall back to `notchFilled` (M4b.1).
 */
export function shapeEnvelope(loop: BorderLoop, plan: WallPlan, cellSize: number): BorderLoop {
  const pts =
    plan.envelope === "hull"
      ? dedupeRing(convexHull(loop.points))
      : notchFilledRing(loop.points, cellSize * Math.max(0.5, plan.notchDepth));
  const points = pts.length >= 3 ? pts : loop.points;
  return { points, segments: points.map(() => "land" as WallSegmentKind), urbanCellIds: loop.urbanCellIds };
}

/**
 * Round the traced wall's own vertices — this is what actually reads as
 * "gatagata" in towngen-comparison.md §2.1/§2.3, and neither `shapeEnvelope`
 * (which only bridges pockets) nor `smoothInteriorVertices` in edgeGraph.ts
 * (§3.C, which explicitly excludes the border) ever touches it. Read
 * TownGeneratorTS's `CurtainWall` constructor for reference
 * (~/Projects/TownGeneratorTS/src/towngenerator/building/CurtainWall.ts +
 * geom/Polygon.ts `smoothVertex`; this is an original reimplementation from
 * that description, not a port) — each non-reserved vertex moves to
 * `(prev + v·f + next) / (2 + f)`, with `f = min(1, 40 / n)` for a ring of `n`
 * vertices. TownGen's own patch scatter gives it a ~15-vertex wall, so f is
 * usually 1 there (a plain 3-point average); our finer Voronoi grid gives a
 * much larger n, so f — and with it the smoothing strength — scales down to
 * compensate, self-calibrating to how jagged the trace actually is instead of
 * needing A-2's grid coarsening to already have happened. `reserved` (e.g. the
 * citadel's own ring) stays fixed, matching TownGen's citadel-reserves-the-
 * main-wall relationship (Model.ts).
 */
export function smoothWallShape(loop: BorderLoop, reserved: Point[] = []): BorderLoop {
  const n = loop.points.length;
  if (n < 5) return loop;
  const f = Math.min(1, 40 / n);
  const isReserved = (p: Point): boolean => reserved.some(r => sameKey(p, r));
  const points = loop.points.map((v, i) => {
    if (isReserved(v)) return [v[0], v[1]] as Point;
    const prev = loop.points[(i - 1 + n) % n];
    const next = loop.points[(i + 1) % n];
    return [(prev[0] + v[0] * f + next[0]) / (2 + f), (prev[1] + v[1] * f + next[1]) / (2 + f)] as Point;
  });
  return { points, segments: points.map(() => "land" as WallSegmentKind), urbanCellIds: loop.urbanCellIds };
}

/**
 * Pull the envelope's sea-facing arc out onto the traced shoreline so a walled
 * town's perimeter actually meets the water (wall-patterns.md §3.1). S3 stops
 * the urban fabric a cell or two short of the sea, so without this the wall ends
 * on open ground and a `coast: open` town is joined to the outside along the
 * beach. The maximal run of vertices facing (and within `reach` of) the sea is
 * replaced wholesale by the shoreline slice between its two ends — a smooth wall
 * along the coast rather than a comb of spikes. The two land walls either side
 * then meet the shoreline at that slice's ends. Only ever grows the ring
 * seaward, so it still contains every urban cell. A no-op without a coast.
 */
export function reachEnvelopeToShore(
  loop: BorderLoop,
  coast: { shoreline: Point[]; waterAzimuthDeg: number } | null,
  cellSize: number,
  cityRadiusMeters: number
): BorderLoop {
  const shore = coast?.shoreline ?? [];
  if (shore.length < 2 || loop.points.length < 6) return loop;
  const reach = Math.min(cellSize * 3.5, cityRadiusMeters * 0.5);
  const toWater = azimuthToVec(coast!.waterAzimuthDeg);
  const n = loop.points.length;

  const eligible = loop.points.map(p => {
    const hit = nearestOnPolyline(p, shore);
    if (hit.dist > reach) return false;
    const dx = hit.point[0] - p[0];
    const dy = hit.point[1] - p[1];
    const d = Math.hypot(dx, dy) || 1;
    // Near the water, or facing roughly toward it (not a stray near-approach).
    return hit.dist < cellSize * 0.25 || (dx / d) * toWater[0] + (dy / d) * toWater[1] > 0.15;
  });
  if (eligible.every(Boolean) || !eligible.some(Boolean)) return loop;

  let start = eligible.findIndex((e, i) => e && !eligible[(i - 1 + n) % n]);
  if (start < 0) start = 0;
  const out: Point[] = [];
  for (let k = 0; k < n; ) {
    const idx = (start + k) % n;
    if (!eligible[idx]) {
      out.push([loop.points[idx][0], loop.points[idx][1]]);
      k++;
      continue;
    }
    const run: number[] = [];
    while (k < n && eligible[(start + k) % n]) {
      run.push((start + k) % n);
      k++;
    }
    // A short flush of eligible vertices is noise — leave it as traced.
    if (run.length < 3) {
      for (const r of run) out.push([loop.points[r][0], loop.points[r][1]]);
      continue;
    }
    const h0 = nearestOnPolyline(loop.points[run[0]], shore);
    const h1 = nearestOnPolyline(loop.points[run[run.length - 1]], shore);
    out.push([h0.point[0], h0.point[1]]);
    if (h0.segIndex <= h1.segIndex) {
      for (let s = h0.segIndex + 1; s <= h1.segIndex; s++) out.push([shore[s][0], shore[s][1]]);
    } else {
      for (let s = h0.segIndex; s > h1.segIndex; s--) out.push([shore[s][0], shore[s][1]]);
    }
    out.push([h1.point[0], h1.point[1]]);
  }
  const points = dedupeRing(out);
  if (points.length < 3 || Math.abs(polygonArea(points)) < 1e-4) return loop;
  return { points, segments: points.map(() => "land" as WallSegmentKind), urbanCellIds: loop.urbanCellIds };
}

function notchFilledRing(loop: Point[], maxDepth: number): Point[] {
  if (loop.length < 4) return loop;
  const hull = convexHull(loop);
  if (hull.length < 3) return loop;
  const marks = [...new Set(hull.map(h => nearestIndex(loop, h)))].sort((a, b) => a - b);
  if (marks.length < 3) return loop;

  const out: Point[] = [];
  for (let k = 0; k < marks.length; k++) {
    const iA = marks[k];
    const iB = marks[(k + 1) % marks.length];
    const sub: Point[] = [];
    for (let j = iA; ; j = (j + 1) % loop.length) {
      sub.push(loop[j]);
      if (j === iB) break;
    }
    let deepest = 0;
    for (const p of sub) deepest = Math.max(deepest, perpDistanceToLine(p, loop[iA], loop[iB]));
    // Bridge only a genuine INWARD pocket: its chord runs outside the traced ring.
    // A `deepest` spike over an outward lobe (a mis-paired hull mark) must keep
    // its arc, or the envelope drops the urban cells on that lobe.
    const inward =
      deepest > maxDepth &&
      [0.25, 0.5, 0.75].every(
        f =>
          !pointInPolygon(
            [loop[iA][0] + (loop[iB][0] - loop[iA][0]) * f, loop[iA][1] + (loop[iB][1] - loop[iA][1]) * f],
            loop
          )
      );
    out.push(...(inward ? [loop[iA]] : sub.slice(0, -1)));
  }
  return dedupeRing(out);
}

/**
 * Tag every envelope edge `points[i] → points[i+1]` as land / coast / river /
 * citadel (wall-patterns.md §6). Priority citadel > coast > river > land.
 */
export interface SegmentContext {
  shoreline: Point[] | null;
  /** Closed water polygon — an edge is `coast` when its outward side is inside it. */
  waterPolygon: Point[] | null;
  rivers: Point[][];
  citadelOutline: Point[] | null;
}

export function classifyWallSegments(loop: BorderLoop, ctx: SegmentContext, cellSize: number): BorderLoop {
  const n = loop.points.length;
  const segments = loop.points.map((a, i) => {
    const b = loop.points[(i + 1) % n];
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (ctx.citadelOutline && ctx.citadelOutline.length >= 2 && near(mid, ctx.citadelOutline, cellSize * 0.6)) {
      return "citadel" as WallSegmentKind;
    }
    if (isCoastEdge(a, b, mid, ctx, cellSize)) return "coast" as WallSegmentKind;
    if (ctx.rivers.some(line => line.length >= 2 && near(mid, line, cellSize))) return "river" as WallSegmentKind;
    return "land" as WallSegmentKind;
  });
  return { ...loop, segments };
}

/**
 * `coast` means the edge RUNS ALONG the water, so dropping it (`coast: open`)
 * leaves no walkable ground: either both endpoints hug the traced shoreline
 * (`reachEnvelopeToShore` puts the sea-facing arc exactly there) or the edge's
 * outward side lies in the sea polygon. An edge running DOWN to the water keeps
 * one endpoint inland and stays `land`, so it is still drawn and closes the
 * perimeter against the shore.
 */
function isCoastEdge(a: Point, b: Point, mid: Point, ctx: SegmentContext, cellSize: number): boolean {
  if (ctx.shoreline && ctx.shoreline.length >= 2) {
    const t = cellSize * 0.6;
    if (nearestOnPolyline(a, ctx.shoreline).dist <= t && nearestOnPolyline(b, ctx.shoreline).dist <= t) return true;
  }
  if (ctx.waterPolygon && ctx.waterPolygon.length >= 3) {
    const len = Math.hypot(mid[0], mid[1]) || 1;
    const out: Point = [mid[0] + (mid[0] / len) * cellSize * 0.6, mid[1] + (mid[1] / len) * cellSize * 0.6];
    if (pointInPolygon(out, ctx.waterPolygon)) return true;
  }
  return false;
}

export interface WallDraw {
  /** Polyline runs to stroke as masonry wall, already `plan.line`-styled. */
  wallRuns: Point[][];
  /** Tower positions along those runs. */
  towers: Point[];
}

/** Water that a wall gap may legitimately front instead of masonry. */
export interface WallDrawContext {
  waterPolygon: Point[] | null;
  shoreline: Point[] | null;
  rivers: Point[][];
}

const NO_WATER: WallDrawContext = { waterPolygon: null, shoreline: null, rivers: [] };

/** Build the drawn wall for one envelope: pick which segment runs get masonry
 * (`plan.coast` / `plan.extent`), style each run (`plan.line`), space towers.
 * Coast runs vanish for `coast: open` — that is the "don't wall the sea" case —
 * but only where the gap is genuinely fronted by water (`ctx`); any other
 * undrawn stretch is sealed so the town is never joined to the outside by open
 * ground (wall-patterns.md §5.1, the closure guarantee). */
export function buildWallDraw(
  border: BorderLoop,
  plan: WallPlan,
  gates: Gate[],
  cellSize: number,
  ctx: WallDrawContext = NO_WATER
): WallDraw {
  if (plan.extent === "none") return { wallRuns: [], towers: [] };
  const reserved = new Set(gates.map(g => pointKey(g.point)));

  const coastDrawn = plan.coast === "seaWall" || plan.coast === "quayWall" || plan.coast === "harborBasin";
  const drawnKind = (kind: WallSegmentKind): boolean => {
    if (kind === "citadel") return true; // fused into the town wall (wall-patterns.md §6)
    if (plan.extent === "landwardOnly") return kind === "land";
    if (kind === "coast") return coastDrawn;
    return true; // land + river
  };
  const drawn = sealDryGaps(border.points, border.segments.map(drawnKind), ctx, cellSize);

  let runs: Point[][];
  if (drawn.every(Boolean)) {
    runs = [close(border.points)];
  } else if (drawn.every(d => !d)) {
    runs = [];
  } else {
    runs = extractRuns(border.points, drawn);
  }

  const styled = runs.map(run => styleRun(run, plan.line, reserved, cellSize));
  const towers = styled.flatMap(run => towerPoints(run, cellSize, isClosedRun(run)));
  return { wallRuns: styled, towers };
}

/** The closure guarantee: masonry + genuine water must together enclose the
 * town. Any maximal run of undrawn edges that is not fronted by water end to end
 * (in the sea polygon, hugging the shoreline, or along a river) gets walled
 * after all. */
function sealDryGaps(points: Point[], drawn: boolean[], ctx: WallDrawContext, cellSize: number): boolean[] {
  const n = drawn.length;
  if (n < 3 || drawn.every(Boolean) || !drawn.some(Boolean)) return drawn;
  const backed = (p: Point): boolean => {
    if (ctx.waterPolygon && ctx.waterPolygon.length >= 3 && pointInPolygon(p, ctx.waterPolygon)) return true;
    if (ctx.shoreline && ctx.shoreline.length >= 2 && nearestOnPolyline(p, ctx.shoreline).dist <= cellSize * 0.5) {
      return true;
    }
    return ctx.rivers.some(line => line.length >= 2 && nearestOnPolyline(p, line).dist <= cellSize * 0.6);
  };
  const out = drawn.slice();
  const start = drawn.findIndex((d, i) => d && !drawn[(i - 1 + n) % n]);
  if (start < 0) return out;
  let i = start;
  for (let step = 0; step < n; ) {
    while (step < n && out[i]) {
      i = (i + 1) % n;
      step++;
    }
    if (step >= n) break;
    const run: number[] = [];
    while (step < n && !out[i]) {
      run.push(i);
      i = (i + 1) % n;
      step++;
    }
    let ok = backed(points[run[0]]) && backed(points[(run[run.length - 1] + 1) % n]);
    for (let r = 0; ok && r < run.length; r++) {
      const e = run[r];
      const b = points[(e + 1) % n];
      ok = backed([(points[e][0] + b[0]) / 2, (points[e][1] + b[1]) / 2]);
    }
    if (!ok) for (const e of run) out[e] = true;
  }
  return out;
}

function styleRun(run: Point[], line: WallPlan["line"], reserved: Set<string>, cellSize: number): Point[] {
  if (run.length < 3) return run;
  const closed = isClosedRun(run);
  if (line === "organic") return smoothRun(run, reserved, closed);
  // polygonal / geometric: straight runs between gates and Douglas–Peucker corners.
  return polygonalRun(run, reserved, cellSize, closed);
}

/** Weak closed/open Laplacian; gate vertices and open endpoints stay put. On a
 * closed run the duplicated seam vertex is smoothed once and re-appended, so the
 * ring stays exactly closed (no hairline gap at the seam). */
function smoothRun(pts: Point[], reserved: Set<string>, closed: boolean): Point[] {
  const src = closed && pts.length >= 2 && sameKey(pts[0], pts[pts.length - 1]) ? pts.slice(0, -1) : pts;
  const n = src.length;
  const out = src.map((p, i) => {
    if (reserved.has(pointKey(p))) return [p[0], p[1]] as Point;
    if (!closed && (i === 0 || i === n - 1)) return [p[0], p[1]] as Point;
    const prev = src[(i - 1 + n) % n];
    const next = src[(i + 1) % n];
    return [p[0] * 0.8 + (prev[0] + next[0]) * 0.1, p[1] * 0.8 + (prev[1] + next[1]) * 0.1] as Point;
  });
  return closed && out.length >= 3 ? close(out) : out;
}

/** Simplify between anchor vertices (gates + run ends) so wall segments are
 * straight and the total length drops — the fix for "凹みで壁長が伸びる". */
function polygonalRun(pts: Point[], reserved: Set<string>, cellSize: number, closed: boolean): Point[] {
  const anchors = [0];
  for (let i = 1; i < pts.length - 1; i++) if (reserved.has(pointKey(pts[i]))) anchors.push(i);
  anchors.push(pts.length - 1);
  const out: Point[] = [];
  for (let a = 0; a < anchors.length - 1; a++) {
    const piece = simplifyPolyline(pts.slice(anchors[a], anchors[a + 1] + 1), cellSize, false);
    out.push(...(a === 0 ? piece : piece.slice(1)));
  }
  return closed && out.length >= 3 && !sameKey(out[0], out.at(-1)!) ? close(out) : out;
}

/** ~40–70 m tower spacing along a run; no separate wall graph. */
function towerPoints(points: Point[], cellSize: number, closed: boolean): Point[] {
  if (points.length < 2) return [];
  const spacing = Math.max(40, Math.min(70, cellSize * 0.75));
  const out: Point[] = [];
  let carried = 0;
  const last = closed ? points.length - 1 : points.length - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = spacing - carried; d < length; d += spacing) {
      out.push([a[0] + ((b[0] - a[0]) * d) / length, a[1] + ((b[1] - a[1]) * d) / length]);
    }
    carried = (carried + length) % spacing;
  }
  return out;
}

/** Maximal wrapping runs of `true` edges → open polylines `points[i..j+1]`. */
function extractRuns(points: Point[], drawn: boolean[]): Point[][] {
  const n = points.length;
  const start = drawn.findIndex((d, i) => d && !drawn[(i - 1 + n) % n]);
  if (start < 0) return [];
  const runs: Point[][] = [];
  let i = start;
  let current: Point[] | null = null;
  for (let step = 0; step < n; step++) {
    if (drawn[i]) {
      if (!current) current = [points[i]];
      current.push(points[(i + 1) % n]);
    } else if (current) {
      runs.push(current);
      current = null;
    }
    i = (i + 1) % n;
  }
  if (current) runs.push(current);
  return runs;
}

function isClosedRun(run: Point[]): boolean {
  return run.length >= 4 && sameKey(run[0], run.at(-1)!);
}

function near(p: Point, poly: Point[], within: number): boolean {
  return nearestOnPolyline(p, poly).dist <= within;
}

function nearestIndex(loop: Point[], p: Point): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - p[0], loop[i][1] - p[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function dedupeRing(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) out.push([p[0], p[1]]);
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)![0], out[0][1] - out.at(-1)![1]) < 1e-6) out.pop();
  return out;
}

function pointKey(point: Point): string {
  return `${Math.round(point[0] * 20)},${Math.round(point[1] * 20)}`;
}

/** Convenience for pipeline: wall + tower overlays for one envelope. */
export function wallOverlaysFor(
  border: BorderLoop,
  plan: WallPlan,
  gates: Gate[],
  cellSize: number,
  ctx?: WallDrawContext
): Overlay[] {
  const draw = buildWallDraw(border, plan, gates, cellSize, ctx);
  return [
    ...draw.wallRuns.map(points => ({ kind: "wall" as const, points })),
    ...draw.towers.map(point => ({ kind: "tower" as const, points: [point] }))
  ];
}
