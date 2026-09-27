// S6 — district assignment (design §4.2 S6, TownGeneratorTS 2.5 `createWards`).
//
// Every urban cell gets a ward type. The citadel is already `Castle` and the
// plaza `Market` (placed in S4). Remaining inner cells take GateWards at the
// gates, then a shuffled mix of craftsmen / merchants / slums / … via
// `rateLocation`. The documented mix is ~36 entries with craftsmen 21 and slum
// 5; this Voronoi grid has hundreds of urban cells, so the mix is *repeated*
// to cover them (otherwise the leftover-Slum rule would paint most of the town
// a slum). Exhausted leftovers still become Slum. Outskirts: 20% Farm when
// compact, else an empty Ward (no buildings).
//
// Programme flags bite here too (burg-feature-options.md §4.4–4.6):
//   temple → Cathedral near the plaza, as Precinct{temple}
//   port   → harbour precinct on the shore (requires a waterbody)
//   shanty → 3–6 CellTag "shanty" cells just outside the border
//
// Placement order: harbour → temple → GateWard → mix → outer GateWard →
// outskirts Farm → shanty. Earlier cellIds are excluded from later candidates.
//
// Algorithms are taken from TownGeneratorTS/docs/** and the public description
// of rateLocation preferences — not from the GPL sources.

import { placeTempleFootprint } from "./civicPlacement";
import {
  azimuthDelta,
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  polygonCompactness,
  polylineTangent,
  vecToAzimuth
} from "./geom";
import { makeRng, type Rng } from "./prng";
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
  WardAssignment,
  WardKind
} from "./types";

const QUANTUM = 0.05;
const RIBBON_CONE_DEG = 15;
const FARM_CHANCE = 0.2;
const FARM_COMPACTNESS = 0.7;
const GATE_CHANCE_WALLED = 0.5;
const GATE_CHANCE_OPEN = 0.2;
const OUTER_GATE_CHANCE = 0.85;

/**
 * Documented 35-entry mix (the 36th TownGenerator slot is Cathedral, which this
 * pipeline places only when `program.temple` is set). Craftsmen 21, slum 5.
 */
const WARD_MIX: WardKind[] = [
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "craftsmen",
  "slum",
  "slum",
  "slum",
  "slum",
  "slum",
  "merchant",
  "merchant",
  "patriciate",
  "patriciate",
  "market",
  "market",
  "administration",
  "military",
  "park"
];

export interface WardInputs {
  cells: Cell[];
  urban: Set<number>;
  outskirts: Set<number>;
  /** Former urban flood-fill cells outside the chosen wall capacity. */
  residentialOutskirts?: Set<number>;
  sea: Set<number>;
  borders: BorderLoop[];
  gates: Gate[];
  /** S4 precincts (plaza / citadel). */
  precincts: Precinct[];
  geo: CityGeography;
  params: CityParams;
  program: CityProgram;
  shoreline: Point[] | null;
  waterPolygon: Point[] | null;
  /** Intramural streets and approach roads, used to site and orient the temple. */
  streets?: Point[][];
  /** River centerlines, used to keep the temple off the water. */
  rivers?: Point[][];
}

export interface WardResult {
  wards: WardAssignment[];
  /**
   * `wards`, but in decision order (harbour → temple → gate wards → the mix
   * loop → outer gate wards → outskirts → shanty) instead of sorted by cell id.
   * A debug slider steps through these to watch assignment unfold "one cell at
   * a time" — the S6 counterpart of `UrbanStage`. See
   * docs/city-generator/towngen-comparison.md.
   */
  assignmentOrder: WardAssignment[];
  /** Newly placed S6 precincts (`temple` / `harbor`). */
  precincts: Precinct[];
  overlays: Overlay[];
  shanty: Set<number>;
}

const EMPTY: WardResult = { wards: [], assignmentOrder: [], precincts: [], overlays: [], shanty: new Set() };

/** Pure. Same interior geometry + programme ⇒ identical wards (dedicated RNG streams). */
export function assignWards(input: WardInputs): WardResult {
  const { cells, urban, outskirts, sea, borders, gates, precincts, geo, params, program, shoreline, waterPolygon } =
    input;
  if (!cells.length) return EMPTY;

  const byId = new Map(cells.map(c => [c.id, c]));
  const assigned = new Map<number, WardKind>();
  const occupied = new Set<number>();
  const extraPrecincts: Precinct[] = [];
  const overlays: Overlay[] = [];
  const R = params.cityRadiusMeters;
  const cellSize = params.cellSizeMeters;
  const plaza = precincts.find(p => p.kind === "plaza") ?? null;
  const citadel = precincts.find(p => p.kind === "citadel") ?? null;
  const citadelIds = new Set(citadel?.cellIds ?? []);
  const plazaIds = new Set(plaza?.cellIds ?? []);

  const take = (id: number, kind: WardKind): void => {
    assigned.set(id, kind);
    occupied.add(id);
  };

  // 1. Citadel → Castle; plaza → Market (S4 already reserved the cells).
  for (const id of citadelIds) take(id, "castle");
  for (const id of plazaIds) take(id, "market");

  // 2. Harbour (coast-bound) before temple so the two cannot collide.
  if (program.port) {
    if (!shoreline || shoreline.length < 2 || !waterPolygon) {
      console.warn("port set but no waterbody");
    } else {
      const harbor = placeHarbor(cells, urban, sea, occupied, shoreline, R);
      if (harbor) {
        extraPrecincts.push(harbor);
        for (const id of harbor.cellIds) take(id, "harbor");
        const quay = quayOverlay(
          shoreline,
          harbor.cellIds.map(id => byId.get(id)).filter((c): c is Cell => !!c),
          cellSize
        );
        if (quay.length >= 2) overlays.push({ kind: "quay", points: quay });
      }
    }
  }

  // 3. Temple / Cathedral next to the plaza.
  const existingTemple = precincts.find(p => p.kind === "temple");
  if (existingTemple) {
    for (const id of existingTemple.cellIds) take(id, "cathedral");
  } else if (program.temple) {
    const templeRng = makeRng(`${params.seed}:program:temple`);
    const temple = placeTemple(
      cells,
      urban,
      occupied,
      plaza,
      citadelIds,
      R,
      cellSize,
      program.capital,
      params.extentMeters,
      templeRng,
      input.streets ?? [],
      input.rivers ?? []
    );
    if (temple) {
      extraPrecincts.push(temple);
      for (const id of temple.cellIds) take(id, "cathedral");
    }
  }

  const rng = makeRng(`${params.seed}:program:wards`);
  const gateChance = program.walls ? GATE_CHANCE_WALLED : GATE_CHANCE_OPEN;
  const gateEps = Math.max(QUANTUM * 2, cellSize * 0.08);

  // 4. Inner cells touching a gate → GateWard (probabilistic).
  for (const cell of cells) {
    if (!urban.has(cell.id) || occupied.has(cell.id)) continue;
    if (!gates.some(g => cellTouchesPoint(cell, g.point, gateEps))) continue;
    if (rng() < gateChance) take(cell.id, "gate");
  }

  // 5. Remaining inner cells: shuffled, possibly-repeated mix + rateLocation.
  const inner = cells.filter(c => urban.has(c.id) && !occupied.has(c.id)).map(c => c.id);
  fillInner(inner, assigned, occupied, byId, citadelIds, plaza, borders, program.walls, rng);

  // 6. Outer cells touching a gate → GateWard (high probability).
  for (const cell of cells) {
    if (urban.has(cell.id) || sea.has(cell.id) || occupied.has(cell.id)) continue;
    if (!gates.some(g => cellTouchesPoint(cell, g.point, gateEps))) continue;
    if (rng() < OUTER_GATE_CHANCE) take(cell.id, "gate");
  }

  // 7. Remaining outskirts: compact + 20% → Farm, else empty Ward.
  for (const cell of cells) {
    if (!outskirts.has(cell.id) || occupied.has(cell.id) || sea.has(cell.id)) continue;
    if (input.residentialOutskirts?.has(cell.id)) {
      take(cell.id, rng() < 0.12 ? "merchant" : "craftsmen");
    } else {
      const farm = rng() < FARM_CHANCE && polygonCompactness(cell.polygon) >= FARM_COMPACTNESS;
      take(cell.id, farm ? "farm" : "empty");
    }
  }

  // 8. Extramural shanty — retags 3–6 cells just outside the border.
  const shanty = new Set<number>();
  if (program.shanty) {
    const shantyRng = makeRng(`${params.seed}:program:shanty`);
    for (const id of pickShanty(cells, urban, sea, occupied, borders, geo, params, program.walls, shantyRng)) {
      take(id, "shanty");
      shanty.add(id);
    }
  }

  // `assigned` is a Map, so its iteration order is insertion order — exactly the
  // decision order phases 1-8 ran in (Map/Set iteration order is a JS guarantee).
  const assignmentOrder: WardAssignment[] = [...assigned.entries()].map(([cellId, kind]) => ({ cellId, kind }));
  const wards = assignmentOrder.slice().sort((a, b) => a.cellId - b.cellId);
  return { wards, assignmentOrder, precincts: extraPrecincts, overlays, shanty };
}

function fillInner(
  unassigned: number[],
  assigned: Map<number, WardKind>,
  occupied: Set<number>,
  byId: Map<number, Cell>,
  citadelIds: Set<number>,
  plaza: Precinct | null,
  borders: BorderLoop[],
  walled: boolean,
  rng: Rng
): void {
  const remaining = unassigned.slice();
  const queue = scaleMix(remaining.length, rng);
  const origin: Point = plaza?.anchor ?? [0, 0];

  while (remaining.length) {
    const kind: WardKind = queue.shift() ?? "slum";
    const pick = pickFor(kind, remaining, byId, assigned, citadelIds, plaza, origin, borders, walled, rng);
    if (pick === null) {
      // This kind cannot sit anywhere left (e.g. MilitaryWard with no wall). Skip
      // it rather than forcing a slum in the middle of the mix.
      if (kind === "slum" || queue.length === 0) {
        const fallback = remaining.reduce((a, b) => (a < b ? a : b));
        assigned.set(fallback, "slum");
        occupied.add(fallback);
        remaining.splice(remaining.indexOf(fallback), 1);
      }
      continue;
    }
    assigned.set(pick, kind);
    occupied.add(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
}

function scaleMix(n: number, rng: Rng): WardKind[] {
  if (n <= 0) return [];
  const copies = Math.max(1, Math.ceil(n / WARD_MIX.length));
  const queue: WardKind[] = [];
  for (let i = 0; i < copies; i++) queue.push(...WARD_MIX);
  // Full Fisher–Yates shuffle: on the coarse ward-scale grid there may be fewer
  // cells than WARD_MIX is long, so the front of the list must not be all one
  // kind — every district type has to get a proportional shot.
  for (let i = queue.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = queue[i];
    queue[i] = queue[j];
    queue[j] = tmp;
  }
  return queue;
}

function pickFor(
  kind: WardKind,
  ids: number[],
  byId: Map<number, Cell>,
  assigned: Map<number, WardKind>,
  citadelIds: Set<number>,
  plaza: Precinct | null,
  origin: Point,
  borders: BorderLoop[],
  walled: boolean,
  rng: Rng
): number | null {
  if (!ids.length) return null;
  const rate = rateLocation(kind, byId, assigned, citadelIds, plaza, origin, borders, walled);
  if (!rate) {
    return ids[rng.int(0, ids.length)];
  }
  let best: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const score = rate(byId.get(id)!);
    if (score < bestScore || (score === bestScore && (best === null || id < best))) {
      bestScore = score;
      best = id;
    }
  }
  return bestScore === Number.POSITIVE_INFINITY ? null : best;
}

/** Lower is better. `null` means "no preference — pick at random". */
function rateLocation(
  kind: WardKind,
  byId: Map<number, Cell>,
  assigned: Map<number, WardKind>,
  citadelIds: Set<number>,
  plaza: Precinct | null,
  origin: Point,
  borders: BorderLoop[],
  walled: boolean
): ((cell: Cell) => number) | null {
  const plazaAnchor = plaza?.anchor ?? origin;
  const plazaSet = new Set(plaza?.cellIds ?? []);
  switch (kind) {
    case "cathedral":
    case "administration":
      // Prefers a cell that shares an edge with the plaza, else close to it.
      return cell => {
        if (cell.neighbors.some(n => plazaSet.has(n))) return 0;
        return dist(cell.centroid, plazaAnchor);
      };
    case "merchant":
      return cell => dist(cell.centroid, origin);
    case "market":
      return cell => {
        if (cell.neighbors.some(n => assigned.get(n) === "market" || plazaSet.has(n))) return Number.POSITIVE_INFINITY;
        const plazaArea = plazaSet.size ? Math.abs(polygonArea(byId.get([...plazaSet][0])!.polygon)) : 1;
        return Math.abs(polygonArea(cell.polygon)) / (plazaArea || 1);
      };
    case "military":
      return cell => {
        if (cell.neighbors.some(n => citadelIds.has(n) || assigned.get(n) === "castle")) return 0;
        if (walled && borders.some(b => cellTouchesLoop(cell, b.points, QUANTUM * 2))) return 1;
        return citadelIds.size === 0 && !walled ? dist(cell.centroid, origin) : Number.POSITIVE_INFINITY;
      };
    case "slum":
      return cell => -dist(cell.centroid, origin);
    case "patriciate":
      return cell => {
        let score = 0;
        for (const n of cell.neighbors) {
          const w = assigned.get(n);
          if (w === "park") score -= 1;
          if (w === "slum") score += 1;
        }
        return score;
      };
    default:
      return null;
  }
}

function placeHarbor(
  cells: Cell[],
  urban: Set<number>,
  sea: Set<number>,
  occupied: Set<number>,
  shoreline: Point[],
  R: number
): Precinct | null {
  const hit = nearestOnPolyline([0, 0], shoreline);
  const P = hit.point;
  const tangent = polylineTangent(shoreline, hit.segIndex);
  const inland = cells
    .filter(c => !sea.has(c.id) && !occupied.has(c.id))
    .sort((a, b) => dist(a.centroid, P) - dist(b.centroid, P) || a.id - b.id);
  const seaAdj = inland.filter(c => urban.has(c.id) && c.neighbors.some(n => sea.has(n)));
  const anchor = seaAdj[0] ?? inland.find(c => urban.has(c.id)) ?? inland[0];
  if (!anchor) return null;

  const along = (c: Cell): number => (c.centroid[0] - P[0]) * tangent[0] + (c.centroid[1] - P[1]) * tangent[1];
  const extras = cells
    .filter(
      c =>
        urban.has(c.id) &&
        c.id !== anchor.id &&
        !occupied.has(c.id) &&
        c.neighbors.some(n => sea.has(n)) &&
        Math.abs(along(c)) <= R * 0.5
    )
    .sort((a, b) => dist(a.centroid, P) - dist(b.centroid, P) || a.id - b.id)
    .slice(0, 3);

  const cellIds = [anchor.id, ...extras.map(c => c.id)];
  return { kind: "harbor", cellIds, anchor: anchor.centroid, label: "Harbour" };
}

function placeTemple(
  cells: Cell[],
  urban: Set<number>,
  occupied: Set<number>,
  plaza: Precinct | null,
  citadelIds: Set<number>,
  _R: number,
  cellSize: number,
  capital: boolean,
  extentMeters: number,
  rng: Rng,
  streets: Point[][],
  rivers: Point[][]
): Precinct | null {
  const placed = placeTempleFootprint(
    cells,
    urban,
    occupied,
    plaza,
    citadelIds,
    extentMeters,
    cellSize,
    capital,
    streets,
    rivers
  );
  // Keep the temple RNG stream in the contract even when capital adds no cell.
  rng();
  if (!placed) return null;
  return {
    kind: "temple",
    cellIds: placed.cellIds,
    anchor: placed.anchor,
    label: "Cathedral",
    rotation: placed.rotation
  };
}

function pickShanty(
  cells: Cell[],
  urban: Set<number>,
  sea: Set<number>,
  occupied: Set<number>,
  borders: BorderLoop[],
  geo: CityGeography,
  params: CityParams,
  walled: boolean,
  rng: Rng
): number[] {
  const cityR = params.cityRadiusMeters;
  const borderR = borders.length ? Math.max(...borders.flatMap(b => b.points.map(p => Math.hypot(...p)))) : cityR;
  // Wide enough that the coarse (ward-scale) rural cells still yield 3+ faubourg
  // candidates in the band just outside the wall.
  const [lo, hi] = walled ? [borderR * 0.92, borderR * 1.8] : [cityR * 0.9, cityR * 1.8];
  const bearings = busiestBearings(geo, walled ? 2 : 1);
  const closed = borders.map(b => (b.points.length ? [...b.points, b.points[0]] : b.points));

  const candidates = cells.filter(c => {
    if (sea.has(c.id) || urban.has(c.id) || occupied.has(c.id)) return false;
    if (closed.some(ring => ring.length >= 4 && pointInPolygon(c.centroid, ring))) return false;
    const reach = Math.hypot(...c.centroid);
    if (reach < lo || reach > hi) return false;
    if (!bearings.length) return true;
    const az = vecToAzimuth(c.centroid[0], c.centroid[1]);
    return bearings.some(b => azimuthDelta(az, b) <= RIBBON_CONE_DEG);
  });

  // If the road-cone is empty, drop the bearing filter so we still place 3–6.
  const pool = candidates.length
    ? candidates
    : cells.filter(c => {
        if (sea.has(c.id) || urban.has(c.id) || occupied.has(c.id)) return false;
        if (closed.some(ring => ring.length >= 4 && pointInPolygon(c.centroid, ring))) return false;
        const reach = Math.hypot(...c.centroid);
        return reach >= lo && reach <= hi;
      });

  const outside = (c: (typeof cells)[number]): boolean =>
    !sea.has(c.id) &&
    !urban.has(c.id) &&
    !occupied.has(c.id) &&
    !closed.some(ring => ring.length >= 4 && pointInPolygon(c.centroid, ring));

  const filled = pool.length >= 3 ? pool : cells.filter(outside);

  const scored = filled.slice().sort((a, b) => {
    const ad = bearings.length
      ? Math.min(...bearings.map(br => azimuthDelta(vecToAzimuth(a.centroid[0], a.centroid[1]), br)))
      : 0;
    const bd = bearings.length
      ? Math.min(...bearings.map(br => azimuthDelta(vecToAzimuth(b.centroid[0], b.centroid[1]), br)))
      : 0;
    const aOut = closed.length
      ? Math.min(...closed.map(ring => (ring.length >= 2 ? nearestOnPolyline(a.centroid, ring).dist : Infinity)))
      : Math.hypot(...a.centroid);
    const bOut = closed.length
      ? Math.min(...closed.map(ring => (ring.length >= 2 ? nearestOnPolyline(b.centroid, ring).dist : Infinity)))
      : Math.hypot(...b.centroid);
    return ad - bd || aOut - bOut || a.id - b.id;
  });

  const want = Math.min(scored.length, 3 + rng.int(0, 4));
  return scored.slice(0, want).map(c => c.id);
}

function busiestBearings(geo: CityGeography, n: number): number[] {
  const fromPaths = geo.roadPaths?.filter(p => p.length >= 2).map(p => vecToAzimuth(p.at(-1)![0], p.at(-1)![1])) ?? [];
  const src = fromPaths.length ? fromPaths : geo.roadBearings;
  return src.slice(0, n);
}

function quayOverlay(shoreline: Point[], harborCells: Cell[], cellSize: number): Point[] {
  if (!harborCells.length) return [];
  const near = (p: Point): boolean =>
    harborCells.some(c => nearestOnPolyline(p, closeRing(c.polygon)).dist < cellSize * 3);
  let first = -1;
  let last = -1;
  for (let i = 0; i < shoreline.length; i++) {
    if (!near(shoreline[i])) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first >= 0 && last > first) {
    return shoreline.slice(first, last + 1).map(p => [p[0], p[1]] as Point);
  }
  const i = nearestOnPolyline(harborCells[0].centroid, shoreline).segIndex;
  const lo = Math.max(0, i - 1);
  const hi = Math.min(shoreline.length, i + 3);
  return shoreline.slice(lo, hi).map(p => [p[0], p[1]] as Point);
}

function cellTouchesPoint(cell: Cell, p: Point, eps: number): boolean {
  return cell.polygon.some(v => Math.hypot(v[0] - p[0], v[1] - p[1]) < eps);
}

function cellTouchesLoop(cell: Cell, loop: Point[], eps: number): boolean {
  if (loop.length < 2) return false;
  const ring = closeRing(loop);
  return cell.polygon.some(v => nearestOnPolyline(v, ring).dist < eps);
}

function closeRing(poly: Point[]): Point[] {
  if (!poly.length) return [];
  const a = poly[0];
  const b = poly[poly.length - 1];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < QUANTUM ? poly : [...poly, a];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
