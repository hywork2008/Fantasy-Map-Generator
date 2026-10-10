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

import type { HistoricalPeriod } from "../types";
import { placeTempleFootprint } from "./civicPlacement";
import { cultivableParts } from "./coastalSuitability";
import { economyWardMix, type WardMixSlot } from "./economicWards";
import {
  azimuthDelta,
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  polygonCompactness,
  polylineSquareDistance,
  polylineTangent,
  segmentInteriorInPolygon,
  segmentSegmentHit,
  vecToAzimuth
} from "./geom";
import { makeRng, type Rng } from "./prng";
import type { BurgSiteEconomy } from "./site/burgSiteEconomy";
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

/**
 * Eras in which intramural burial within crowded city cores was prohibited or superseded
 * by extramural suburban / garden cemeteries (Père Lachaise, London Magnificent Seven, etc.)
 * starting with 18th-century Enlightenment reforms, the 1780 Holy Innocents closure, and 19th-century burial acts.
 */
export const MODERN_BURIAL_PERIODS: ReadonlySet<HistoricalPeriod> = new Set<HistoricalPeriod>([
  "preIndustrialEra",
  "steamEra",
  "industrialChemistryEra",
  "petroleumEra",
  "rocketryEra"
]);

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
  /** Mesh window the shore was classified in. Defaults to the civic town extent. */
  frameExtentMeters?: number;
  oceanShorelines?: Point[][];
  riverBanks?: Point[][];
  waterPolygon: Point[] | null;
  /** Intramural streets and approach roads, used to site and orient the temple. */
  streets?: Point[][];
  /** FMG roads drawn across the map outside the town streets (frame legs, far-bank
   * bridge arms). Only used to keep the cemetery off cells they run through. */
  exteriorRoads?: Point[][];
  /** River centerlines, used to keep the temple off the water. */
  rivers?: Point[][];
  /** When set, the inner mix follows guild practitioners, commerce.rank, and marketCenter. */
  economy?: BurgSiteEconomy;
  historicalPeriod?: HistoricalPeriod;
  burialProfile?: import("../../../data/burialCultures").BurialCultureProfile;
  elevations?: Map<number, number>;
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
  const craftDomains = new Map<number, NonNullable<WardMixSlot["craftDomain"]>>();
  const occupied = new Set<number>();
  const extraPrecincts: Precinct[] = [];
  const overlays: Overlay[] = [];
  const R = params.cityRadiusMeters;
  const cellSize = params.cellSizeMeters;
  const plaza = precincts.find(p => p.kind === "plaza") ?? null;
  const citadel = precincts.find(p => p.kind === "citadel") ?? null;
  const citadelIds = new Set(citadel?.cellIds ?? []);
  const plazaIds = new Set(plaza?.cellIds ?? []);
  const oceanShore = (input.oceanShorelines ?? []).flatMap(line =>
    line.slice(1).map((point, index) => [line[index], point] as [Point, Point])
  );

  const take = (id: number, kind: WardKind): void => {
    assigned.set(id, kind);
    occupied.add(id);
  };

  // 1. Citadel → Castle; plaza → Market (S4 already reserved the cells).
  for (const id of citadelIds) take(id, "castle");
  for (const id of plazaIds) take(id, "market");

  // 2. Harbour (coast-bound) before temple so the two cannot collide.
  if (program.port) {
    const riverHarbour =
      (geo.riverPort && input.riverBanks?.length) || !shoreline || shoreline.length < 2 || !waterPolygon;
    // A river port with its own sea haven (an estuary town) gets both harbours.
    // It needs real open water near the town, not a sliver at the window edge (Yalkan).
    const seaHarbour =
      !riverHarbour ||
      (!!geo.seaPort && !!shoreline && shoreline.length >= 2 && !!waterPolygon && sea.size >= ESTUARY_SEA_MIN_CELLS);
    if (riverHarbour) {
      // Navigable river frontage can exist without a sea/lake water polygon.
      const lines = input.riverBanks?.length ? input.riverBanks : (input.rivers ?? []);
      const candidates = cells.filter(
        c =>
          ((geo.riverPort && input.riverBanks?.length) || urban.has(c.id) || outskirts.has(c.id)) &&
          !sea.has(c.id) &&
          !occupied.has(c.id) &&
          (!input.riverBanks?.length ||
            input.riverBanks.filter(bank => pointInPolygon(c.centroid, bank)).length % 2 === 0)
      );
      const distanceToRiver = (c: Cell): number =>
        Math.min(
          ...lines.map(line => {
            if (!input.riverBanks?.length) return nearestOnPolyline(c.centroid, line).dist;
            if (
              line
                .slice(1)
                .some((p, i) =>
                  c.polygon.some((q, j) => segmentSegmentHit(line[i], p, q, c.polygon[(j + 1) % c.polygon.length]))
                )
            )
              return 0;
            return Math.min(
              ...c.polygon.map(p => nearestOnPolyline(p, line).dist),
              ...line.map(p => nearestOnPolyline(p, [...c.polygon, c.polygon[0]]).dist)
            );
          })
        );
      const bankDistances = new Map(candidates.map(c => [c.id, distanceToRiver(c)]));
      candidates.sort(
        (a, b) =>
          bankDistances.get(a.id)! - bankDistances.get(b.id)! ||
          Math.hypot(...a.centroid) - Math.hypot(...b.centroid) ||
          a.id - b.id
      );
      const anchor = candidates[0];
      if (anchor && bankDistances.get(anchor.id)! <= cellSize * 1.5) {
        extraPrecincts.push({ kind: "harbor", cellIds: [anchor.id], anchor: anchor.centroid, label: "River Harbour" });
        take(anchor.id, "harbor");
        if (!urban.has(anchor.id)) outskirts.add(anchor.id);
      }
    }
    if (seaHarbour && shoreline) {
      const placed = placeHarbor(cells, urban, sea, occupied, shoreline, R);
      // Far from a small town disk, but the surveyed shore still crosses this
      // frame: that is the sea port, not a sliver clipped by the window edge.
      const harbor =
        placed &&
        riverHarbour &&
        Math.hypot(placed.anchor[0], placed.anchor[1]) > R * ESTUARY_SEA_MAX_RADII &&
        !estuaryShoreEntersFrame(shoreline, input.frameExtentMeters ?? params.extentMeters)
          ? null
          : placed;
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
  const templeIds = new Set<number>();
  const existingTemple = precincts.find(p => p.kind === "temple");
  if (existingTemple) {
    for (const id of existingTemple.cellIds) {
      take(id, "cathedral");
      templeIds.add(id);
    }
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
      input.rivers ?? [],
      program.walls ? borders.map(border => [...border.points, border.points[0]]) : [],
      sea
    );
    if (temple) {
      extraPrecincts.push(temple);
      for (const id of temple.cellIds) {
        take(id, "cathedral");
        templeIds.add(id);
      }
    }
  }

  const rng = makeRng(`${params.seed}:program:wards`);

  // 3.5. Cemetery: every medieval or modern city requires a churchyard or municipal cemetery.
  const cemeteryRng = makeRng(`${params.seed}:cemetery`);
  const cemeteryId = placeCemetery(
    Math.max(QUANTUM * 2, cellSize * 0.08),
    cells,
    urban,
    outskirts,
    occupied,
    sea,
    templeIds,
    plaza,
    citadelIds,
    gates,
    [...(input.streets ?? []), ...(input.exteriorRoads ?? [])],
    input.historicalPeriod,
    cemeteryRng,
    input.burialProfile,
    input.riverBanks?.length ? input.riverBanks : input.rivers,
    input.elevations
  );
  if (cemeteryId !== null) {
    take(cemeteryId, "cemetery");
  }

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
  fillInner(
    inner,
    assigned,
    craftDomains,
    occupied,
    byId,
    citadelIds,
    plaza,
    borders,
    program.walls,
    rng,
    input.economy
  );

  // 6. Outer cells touching a gate → GateWard (high probability).
  for (const cell of cells) {
    if (urban.has(cell.id) || sea.has(cell.id) || occupied.has(cell.id)) continue;
    if (!gates.some(g => cellTouchesPoint(cell, g.point, gateEps))) continue;
    if (rng() < OUTER_GATE_CHANCE) {
      take(cell.id, "gate");
      // A gate suburb is built-up land; outside the outskirts it would keep
      // its ward but never be buildable, so it drew no houses.
      outskirts.add(cell.id);
    }
  }

  // 7. Remaining outskirts: compact + 20% → Farm, else empty Ward.
  for (const cell of cells) {
    if (!outskirts.has(cell.id) || occupied.has(cell.id) || sea.has(cell.id)) continue;
    if (input.residentialOutskirts?.has(cell.id)) {
      take(cell.id, rng() < 0.12 ? "merchant" : "craftsmen");
    } else {
      const farm =
        rng() < FARM_CHANCE &&
        polygonCompactness(cell.polygon) >= FARM_COMPACTNESS &&
        cultivableParts(cell.polygon, oceanShore).length > 0;
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
  const assignmentOrder: WardAssignment[] = [...assigned.entries()].map(([cellId, kind]) => {
    const craftDomain = craftDomains.get(cellId);
    return craftDomain ? { cellId, kind, craftDomain } : { cellId, kind };
  });
  const wards = assignmentOrder.slice().sort((a, b) => a.cellId - b.cellId);
  return { wards, assignmentOrder, precincts: extraPrecincts, overlays, shanty };
}

function fillInner(
  unassigned: number[],
  assigned: Map<number, WardKind>,
  craftDomains: Map<number, NonNullable<WardMixSlot["craftDomain"]>>,
  occupied: Set<number>,
  byId: Map<number, Cell>,
  citadelIds: Set<number>,
  plaza: Precinct | null,
  borders: BorderLoop[],
  walled: boolean,
  rng: Rng,
  economy?: BurgSiteEconomy
): void {
  const remaining = unassigned.slice();
  const queue = scaleMix(remaining.length, rng, economy);
  const origin: Point = plaza?.anchor ?? [0, 0];

  while (remaining.length) {
    const slot: WardMixSlot = queue.shift() ?? { kind: "slum" };
    const kind = slot.kind;
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
    if (kind === "craftsmen" && slot.craftDomain) craftDomains.set(pick, slot.craftDomain);
    occupied.add(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
}

function scaleMix(n: number, rng: Rng, economy?: BurgSiteEconomy): WardMixSlot[] {
  if (n <= 0) return [];
  const mix = economy ? economyWardMix(economy) : WARD_MIX.map(kind => ({ kind }));
  const copies = Math.max(1, Math.ceil(n / mix.length));
  const queue: WardMixSlot[] = [];
  for (let i = 0; i < copies; i++) queue.push(...mix);
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

/** Open-water cells an estuary sea harbour must claim before it is drawn. */
const ESTUARY_SEA_MIN_CELLS = 6;
/** ... within this many town radii of the centre. */
const ESTUARY_SEA_MAX_RADII = 3;
/** A shore this far inside the frame has room for a berth. One that only
 * grazes the edge (Yalkan) does not. */
const ESTUARY_SEA_MIN_INSET_METERS = 60;

/** The surveyed shore crosses the frame, rather than merely touching its edge. */
export function estuaryShoreEntersFrame(shoreline: Point[], extentMeters: number): boolean {
  if (shoreline.length < 2 || !(extentMeters > 0)) return false;
  return extentMeters / 2 - polylineSquareDistance(shoreline) >= ESTUARY_SEA_MIN_INSET_METERS;
}

function placeHarbor(
  cells: Cell[],
  urban: Set<number>,
  sea: Set<number>,
  occupied: Set<number>,
  shoreline: Point[],
  R: number
): Precinct | null {
  if (!shoreline.length || !sea.size) return null;
  const hit = nearestOnPolyline([0, 0], shoreline);
  const P = hit.point;
  const tangent = polylineTangent(shoreline, hit.segIndex);

  // 海（sea）に隣接する未占有の陸地セルのみを対象とする
  const seaAdjacent = cells.filter(c => !sea.has(c.id) && !occupied.has(c.id) && c.neighbors.some(n => sea.has(n)));
  if (!seaAdjacent.length) return null;

  // 都市化エリア（urban）内の海沿いセルを最優先、なければその他の海沿いセル
  const urbanSeaAdj = seaAdjacent.filter(c => urban.has(c.id));
  const candidates = urbanSeaAdj.length ? urbanSeaAdj : seaAdjacent;
  candidates.sort((a, b) => dist(a.centroid, P) - dist(b.centroid, P) || a.id - b.id);
  const anchor = candidates[0];
  if (!anchor) return null;

  const along = (c: Cell): number => (c.centroid[0] - P[0]) * tangent[0] + (c.centroid[1] - P[1]) * tangent[1];
  const extras = seaAdjacent
    .filter(c => c.id !== anchor.id && Math.abs(along(c)) <= R * 0.5)
    .sort((a, b) => {
      const aUrban = urban.has(a.id) ? 0 : 1;
      const bUrban = urban.has(b.id) ? 0 : 1;
      return aUrban - bUrban || dist(a.centroid, P) - dist(b.centroid, P) || a.id - b.id;
    })
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
  rivers: Point[][],
  walls: Point[][],
  sea: Set<number>
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
    rivers,
    walls,
    sea
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

/**
 * Automatically places a churchyard or municipal cemetery based on historical period.
 *
 * - For modern eras (pre-industrial Enlightenment, Industrial Revolution / steam era and later),
 *   burials were banned intramurally (within city walls and dense urban residential quarters) due to
 *   public health reforms and overcrowding (e.g. 1780 Holy Innocents closure, 1804 Napoleonic decrees,
 *   1850s London Burial Acts). The cemetery is placed extramurally in the suburban outskirts (`outskirts`),
 *   prioritizing accessible locations along gate approach roads with generous space and quiet topography.
 *
 * - For earlier eras (classical antiquity through early/high/late medieval and age of exploration),
 *   burials took place on consecrated ground immediately surrounding parish churches or cathedrals:
 *   Priority 1: A cell adjacent to the Cathedral/Temple (Churchyard), preferably to the South or East.
 *   Priority 2: In the urban core, a quiet cell away from the central market/citadel.
 */
function isCellPenetratedByStreet(cellPolygon: Point[], cellCentroid: Point, streets: Point[][]): boolean {
  for (const street of streets) {
    if (street.length < 2) continue;
    for (let i = 0; i < street.length - 1; i++) {
      if (segmentInteriorInPolygon(street[i], street[i + 1], cellPolygon)) {
        return true;
      }
    }
    const hit = nearestOnPolyline(cellCentroid, street);
    if (hit.dist < 14) {
      return true;
    }
  }
  return false;
}

function placeCemetery(
  gateEps: number,
  cells: Cell[],
  urban: Set<number>,
  outskirts: Set<number>,
  occupied: Set<number>,
  sea: Set<number>,
  templeIds: Set<number>,
  plaza: Precinct | null,
  citadelIds: Set<number>,
  gates: Gate[],
  streets: Point[][],
  historicalPeriod: HistoricalPeriod | undefined,
  rng: Rng,
  burialProfile?: import("../../../data/burialCultures").BurialCultureProfile,
  rivers?: Point[][],
  elevations?: Map<number, number>
): number | null {
  const byId = new Map(cells.map(c => [c.id, c]));
  const isModern = !!historicalPeriod && MODERN_BURIAL_PERIODS.has(historicalPeriod);
  const zoning = burialProfile?.zoning ?? (isModern ? "extramural_sanitary" : "intramural_core");
  // A cemetery never takes a cell at a gate. Wards are assigned before roads
  // are routed on the final mesh, so the planned streets do not yet show the
  // approach through the gate; the rim cell farthest from the plaza is often
  // the gate cell (Senia/Gozelsk: the gate moved 95 m and its road was cut).
  const atGate = (id: number) => {
    const cell = byId.get(id);
    return !!cell && gates.some(g => cellTouchesPoint(cell, g.point, gateEps));
  };

  // 1. Riverfront Ghat Placement (Hindu / Holy river cremation ghats)
  if (zoning === "riverfront_ghat" && rivers && rivers.length > 0) {
    const riverCandidates: Array<{ id: number; score: number }> = [];
    for (const [id, cell] of byId.entries()) {
      if (occupied.has(id) || sea.has(id) || atGate(id)) continue;
      let minRiverDist = Infinity;
      for (const r of rivers) {
        if (r.length < 2) continue;
        const hit = nearestOnPolyline(cell.centroid, r);
        if (hit.dist < minRiverDist) minRiverDist = hit.dist;
      }
      if (minRiverDist <= 30) {
        const score = 150 - minRiverDist * 3 + rng() * 10;
        if (!isCellPenetratedByStreet(cell.polygon, cell.centroid, streets)) {
          riverCandidates.push({ id, score });
        }
      }
    }
    if (riverCandidates.length > 0) {
      riverCandidates.sort((a, b) => b.score - a.score);
      return riverCandidates[0].id;
    }
    return null;
  }
  if (zoning === "riverfront_ghat") return null;

  const isExtramural =
    zoning === "extramural_highway" ||
    zoning === "extramural_sanitary" ||
    zoning === "topographic_hill" ||
    zoning === "isolated_highland";

  // 2. Extramural Placement: Outside walls / in outskirts along approach roads or scenic ridges
  if (isExtramural && outskirts.size > 0) {
    const outskirtsCandidates: Array<{ id: number; score: number }> = [];
    // Cells that only miss the culture's ideal road/plaza distance. Every
    // town buried its dead somewhere, so these beat having no cemetery.
    const relaxedCandidates: Array<{ id: number; score: number }> = [];
    const plazaCenter = plaza?.anchor ?? [0, 0];

    for (const id of outskirts) {
      if (occupied.has(id) || sea.has(id) || urban.has(id) || atGate(id)) continue;
      const cell = byId.get(id);
      if (!cell || cell.polygon.length < 3) continue;

      const compactness = polygonCompactness(cell.polygon);
      if (compactness < 0.25) continue;

      // Proximity to gates: suburban cemeteries were accessible along roads outside the gates
      let minGateDist = Infinity;
      for (const g of gates) {
        const d = Math.hypot(cell.centroid[0] - g.point[0], cell.centroid[1] - g.point[1]);
        if (d < minGateDist) minGateDist = d;
      }

      // Proximity to approach roads / streets: carriage accessibility for funeral corteges
      let minStreetDist = Infinity;
      for (const street of streets) {
        if (street.length < 2) continue;
        const hit = nearestOnPolyline(cell.centroid, street);
        if (hit.dist < minStreetDist) minStreetDist = hit.dist;
      }

      const distToPlaza = Math.hypot(cell.centroid[0] - plazaCenter[0], cell.centroid[1] - plazaCenter[1]);
      const missesIdeal =
        (!!burialProfile && zoning === "extramural_highway" && (minStreetDist < 10 || minStreetDist > 50)) ||
        (!!burialProfile && zoning === "extramural_sanitary" && distToPlaza < 100);

      // Ideal suburban gate distance: ~60m to 250m (not blocking the immediate gate arch, but nearby)
      const gateScore = minGateDist < Infinity ? 30 / (1 + Math.abs(minGateDist - 120) / 60) : 10;

      // Proximity to approach road: cemetery should be alongside road (~15m to 45m), not bisected by it
      const roadMultiplier = zoning === "extramural_highway" ? 2.5 : 1.0;
      const roadScore = (minStreetDist < Infinity ? 25 / (1 + Math.abs(minStreetDist - 25) / 25) : 5) * roadMultiplier;

      // Suburban cemeteries benefited from well-proportioned land parcels for garden pathways
      const shapeScore = compactness * 20;

      // Border penalty/bonus: isolated highlands prefer outer borders, urban suburbs prefer interior
      const borderScore = cell.onBorder
        ? zoning === "isolated_highland" || zoning === "topographic_hill"
          ? 15
          : -15
        : 0;
      const distPlazaWeight = zoning === "isolated_highland" || zoning === "topographic_hill" ? 0.2 : 0.05;

      const elevationScore =
        zoning === "topographic_hill" || zoning === "isolated_highland" ? (elevations?.get(id) ?? 0) * 10 : 0;
      const score =
        gateScore + roadScore + shapeScore + borderScore + elevationScore + distToPlaza * distPlazaWeight + rng() * 10;
      // Reject cells that have a major road or highway cutting straight through them
      if (isCellPenetratedByStreet(cell.polygon, cell.centroid, streets)) continue;

      (missesIdeal ? relaxedCandidates : outskirtsCandidates).push({ id, score });
    }

    for (const list of [outskirtsCandidates, relaxedCandidates]) {
      if (list.length === 0) continue;
      list.sort((a, b) => b.score - a.score);
      return list[0].id;
    }
  }

  // Cultures that bury outside the town never move the cemetery inside it.
  if (burialProfile && isExtramural) return null;

  // Traditional Intramural Placement (Medieval / Churchyard / Core)
  const isIntramural =
    zoning === "intramural_core" ||
    zoning === "household_intramural" ||
    zoning === "subterranean_network" ||
    !isExtramural;

  // Priority 1: Adjacent to temple (Churchyard).
  if (isIntramural && templeIds.size > 0) {
    const candidates: Array<{ id: number; score: number }> = [];
    const templeCenters = [...templeIds]
      .map(id => byId.get(id))
      .filter((c): c is Cell => !!c)
      .map(c => c.centroid);

    const tc: Point = templeCenters.length
      ? [
          templeCenters.reduce((s, p) => s + p[0], 0) / templeCenters.length,
          templeCenters.reduce((s, p) => s + p[1], 0) / templeCenters.length
        ]
      : [0, 0];

    for (const tid of templeIds) {
      const tCell = byId.get(tid);
      if (!tCell) continue;
      for (const nid of tCell.neighbors) {
        if (!urban.has(nid) || occupied.has(nid) || sea.has(nid) || atGate(nid)) continue;
        const nCell = byId.get(nid);
        if (!nCell) continue;

        // Prefer South (negative Y) and East (positive X)
        const dy = nCell.centroid[1] - tc[1];
        const dx = nCell.centroid[0] - tc[0];
        const orientationScore = -dy * 1.5 + dx * 0.5;
        const score = orientationScore + rng() * 10;
        // Reject if streets penetrate the candidate churchyard cell
        if (isCellPenetratedByStreet(nCell.polygon, nCell.centroid, streets)) continue;

        candidates.push({ id: nid, score });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].id;
    }
  }

  // Priority 2: In urban core, prefer cells slightly away from central plaza/citadel
  const urbanCandidates: Array<{ id: number; score: number }> = [];
  const plazaCenter = plaza?.anchor ?? [0, 0];
  for (const id of urban) {
    if (occupied.has(id) || sea.has(id) || atGate(id)) continue;
    const cell = byId.get(id);
    if (!cell) continue;

    const distToPlaza = Math.hypot(cell.centroid[0] - plazaCenter[0], cell.centroid[1] - plazaCenter[1]);
    const score = distToPlaza + rng() * 20;
    if (isCellPenetratedByStreet(cell.polygon, cell.centroid, streets)) continue;

    urbanCandidates.push({ id, score });
  }

  if (urbanCandidates.length > 0) {
    urbanCandidates.sort((a, b) => b.score - a.score);
    return urbanCandidates[0].id;
  }

  if (
    burialProfile &&
    (zoning === "intramural_core" || zoning === "household_intramural" || zoning === "subterranean_network")
  )
    return null;

  // Fallback: any available outskirts cell if urban was exhausted
  for (const id of outskirts) {
    const cell = byId.get(id);
    if (
      cell &&
      !occupied.has(id) &&
      !sea.has(id) &&
      !atGate(id) &&
      !isCellPenetratedByStreet(cell.polygon, cell.centroid, streets)
    )
      return id;
  }

  return null;
}
