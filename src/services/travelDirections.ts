/**
 * Burg-to-burg travel directions: distance, elevation, and travel time along the charted
 * road/trail/sea-route network, per transport mode (foot / mounted / horse-cart). Backs the
 * map-context-menu "Distance to/from {burg}" flow (src/controllers/mapContextMenu.ts) — see
 * docs/plan/burg-directions.md.
 *
 * Deliberately fully core (no dependency on the economy extension's TradeAnimation pathfinder or
 * CaravanMovement settings) so it keeps working with that extension disabled: pathfinding walks
 * landRouteGraph.ts / seaRouteGraph.ts directly, both already core. Speed constants below are
 * declared locally rather than imported from the economy extension — land ones intentionally
 * match its CaravanMovement defaults for consistency, but are restated so this module has no
 * runtime dependency on it.
 *
 * Ship is not a selectable mode of its own: every mode's route is found over the combined
 * land+sea network (findMergedRoutePath), so a sea leg is used automatically whenever it's part
 * of the fastest path (e.g. two ports on different landmasses resolve to an all-sea route). The
 * "avoid sea" option restricts the search to the land network only, falling back to the mixed
 * route (with `seaRequiredDespiteAvoid: true`) when no land-only path exists at all.
 */

import FlatQueue from "flatqueue";
import { worldContext } from "../context/worldContext";
import { buildLandRouteGraph, type LandRouteGraph } from "../generators/landRouteGraph";
import { buildSeaRouteGraph, type SeaRouteGraph } from "../generators/seaRouteGraph";
import { useOptionsState } from "../store/optionsState";
import type { Burg } from "../types/models";
import { heightToMeters, normalizeHeightExponent } from "../utils/height";
import {
  buildRouteGradeProfileFromPoints,
  DEFAULT_HORSE_GRADE_SENSITIVITY,
  DEFAULT_INFANTRY_GRADE_SENSITIVITY,
  DEFAULT_MOUNTED_GRADE_SENSITIVITY,
  type GradeSensitivity,
  landEdgeEffortCost,
  type RouteGradeProfile
} from "./routeGrade";

export type TravelMode = "foot" | "mounted" | "wagon";

export const TRAVEL_MODES: readonly TravelMode[] = ["foot", "mounted", "wagon"];

export type RouteComposition = "land" | "sea" | "mixed";
export type HopKind = "land" | "sea";

export interface DirectionsRoute {
  mode: TravelMode;
  /** Ordered cell path, both endpoints inclusive. */
  cells: number[];
  /** kinds[i] is the transport used for the hop cells[i] -> cells[i + 1]. */
  kinds: HopKind[];
  composition: RouteComposition;
  distanceKm: number;
  landDistanceKm: number;
  seaDistanceKm: number;
  /** Continuous travel time, including port-transfer time on any land<->sea change (see
   * PORT_TRANSFER_PENALTY_DAYS) — not ceiled to a whole simulation day (see splitTravelDuration). */
  durationDays: number;
  ascentM: number;
  descentM: number;
  /** Full grade profile only for an all-land route (chart-ready); null otherwise — a route with
   * any sea leg still gets ascentM/descentM (summed over its land hops) but no chart/pass data. */
  gradeProfile: RouteGradeProfile | null;
  /** True when "avoid sea" was requested but no land-only path existed, so this route still
   * includes a sea leg anyway. */
  seaRequiredDespiteAvoid: boolean;
}

export type ModeResult =
  | { available: true; route: DirectionsRoute }
  | { available: false; reasonKey: "noRoute" | "sameLocation" };

export type DirectionsResult = Record<TravelMode, ModeResult>;

interface LandModeConfig {
  kmPerDay: number;
  sensitivity: GradeSensitivity;
}

/** Matches economy's CaravanMovement DEFAULT_MOVEMENT_SETTINGS.landKmPerDay (horse-drawn wagon). */
const WAGON_KM_PER_DAY = 32;
/** Medieval foot-travel pace — matches regimentMovement.ts's FOOT_SPEED_KM_PER_DAY, restated
 * locally (see module doc comment) rather than imported. */
const FOOT_KM_PER_DAY = 28;
/** A single rider's sustainable pace — faster than a laden wagon, slower than a military cavalry
 * formation's burst march (regimentMovement.ts's CAVALRY_BURST_SPEED_KM_PER_DAY = 56, a pace this
 * traveler doesn't need to sustain day after day). */
const MOUNTED_KM_PER_DAY = 48;
/** Matches economy's CaravanMovement DEFAULT_MOVEMENT_SETTINGS.seaKmPerDay. */
const SHIP_KM_PER_DAY = 60;
/** Loading/unloading time charged once per land<->sea transition along a route — matches
 * economy's tradeRouteDuration.ts PORT_TRANSFER_PENALTY_DAYS, restated locally. */
const PORT_TRANSFER_PENALTY_DAYS = 2;

const LAND_MODE_CONFIG: Record<TravelMode, LandModeConfig> = {
  foot: { kmPerDay: FOOT_KM_PER_DAY, sensitivity: DEFAULT_INFANTRY_GRADE_SENSITIVITY },
  mounted: { kmPerDay: MOUNTED_KM_PER_DAY, sensitivity: DEFAULT_MOUNTED_GRADE_SENSITIVITY },
  wagon: { kmPerDay: WAGON_KM_PER_DAY, sensitivity: DEFAULT_HORSE_GRADE_SENSITIVITY }
};

function resolveDistanceScale(): number {
  return worldContext.distanceScale || 1;
}

function resolveHeightExponent(): number {
  return normalizeHeightExponent(useOptionsState.getState().heightExponent);
}

function cellPoints(cells: readonly number[]): [number, number, number][] {
  const p = worldContext.pack.cells.p;
  return cells.map(cell => [p[cell][0], p[cell][1], cell]);
}

function readHeight(heights: ArrayLike<number>, cell: number): number {
  const h = heights[cell];
  return typeof h === "number" && Number.isFinite(h) ? h : 0;
}

// ─── Merged land+sea pathfinding ───────────────────────────────────────────────

interface MergedPathResult {
  cells: number[];
  kinds: HopKind[];
  /** Raw Dijkstra total (land effort-time + sea time), before the port-transfer penalty. */
  days: number;
}

/**
 * Dijkstra over the union of the land and sea route graphs, both edge sets converted to a time
 * (days) cost so a single search finds the genuinely fastest path regardless of which network
 * it uses. Pass `seaGraph: null` to restrict the search to land only (the "avoid sea" option).
 *
 * The port-transfer penalty (PORT_TRANSFER_PENALTY_DAYS) is intentionally NOT part of the edge
 * cost here — see buildDirectionsRoute, which tallies transitions on the winning path and adds
 * the penalty once for display. Baking it into the search would need mode-state tracking (as
 * TradeAnimation does); route networks rarely oscillate between land/sea often enough for the
 * difference to matter, so the simpler two-step approach is preferred here.
 */
function findMergedRoutePath(
  landGraph: LandRouteGraph,
  seaGraph: SeaRouteGraph | null,
  start: number,
  end: number,
  landDayCost: (from: number, to: number, planarDist: number) => number,
  seaDayCost: (planarDist: number) => number
): MergedPathResult | null {
  if (start === end) return { cells: [start], kinds: [], days: 0 };

  const dist = new Map<number, number>();
  const from = new Map<number, { cell: number; kind: HopKind }>();
  dist.set(start, 0);

  const queue = new FlatQueue<number>();
  queue.push(start, 0);
  const settled = new Set<number>();

  while (queue.length) {
    const currentDist = queue.peekValue()!;
    const current = queue.pop()!;
    if (settled.has(current)) continue;
    settled.add(current);
    if (current === end) break;

    const landNeighbors = landGraph.adjacency.get(current);
    if (landNeighbors) {
      for (const [next, planarDist] of landNeighbors) {
        if (settled.has(next)) continue;
        const step = landDayCost(current, next, planarDist);
        if (!Number.isFinite(step) || step < 0) continue;
        const total = currentDist + step;
        if (total < (dist.get(next) ?? Infinity)) {
          dist.set(next, total);
          from.set(next, { cell: current, kind: "land" });
          queue.push(next, total);
        }
      }
    }

    const seaNeighbors = seaGraph?.adjacency.get(current);
    if (seaNeighbors) {
      for (const [next, planarDist] of seaNeighbors) {
        if (settled.has(next)) continue;
        const step = seaDayCost(planarDist);
        if (!Number.isFinite(step) || step < 0) continue;
        const total = currentDist + step;
        if (total < (dist.get(next) ?? Infinity)) {
          dist.set(next, total);
          from.set(next, { cell: current, kind: "sea" });
          queue.push(next, total);
        }
      }
    }
  }

  const totalDays = dist.get(end);
  if (totalDays === undefined) return null;

  const cells = [end];
  const kinds: HopKind[] = [];
  let node = end;
  while (from.has(node)) {
    const prev = from.get(node)!;
    cells.push(prev.cell);
    kinds.push(prev.kind);
    node = prev.cell;
  }
  cells.reverse();
  kinds.reverse();

  return { cells, kinds, days: totalDays };
}

function buildDirectionsRoute(
  mode: TravelMode,
  pathResult: MergedPathResult,
  ctx: { distanceScale: number; heightExponent: number; heights: ArrayLike<number> },
  seaRequiredDespiteAvoid: boolean
): DirectionsRoute {
  const { cells, kinds } = pathResult;
  const p = worldContext.pack.cells.p;

  let landDistanceKm = 0;
  let seaDistanceKm = 0;
  let ascentM = 0;
  let descentM = 0;
  let transitions = 0;
  let prevKind: HopKind | null = null;

  for (let i = 0; i < kinds.length; i++) {
    const [x1, y1] = p[cells[i]];
    const [x2, y2] = p[cells[i + 1]];
    const hopKm = Math.hypot(x2 - x1, y2 - y1) * ctx.distanceScale;

    if (kinds[i] === "land") {
      landDistanceKm += hopKm;
      const h1 = heightToMeters(readHeight(ctx.heights, cells[i]), ctx.heightExponent);
      const h2 = heightToMeters(readHeight(ctx.heights, cells[i + 1]), ctx.heightExponent);
      const rise = h2 - h1;
      if (rise > 0) ascentM += rise;
      else descentM += -rise;
    } else {
      seaDistanceKm += hopKm;
    }

    if (prevKind && prevKind !== kinds[i]) transitions++;
    prevKind = kinds[i];
  }

  const isAllLand = kinds.length === 0 || kinds.every(k => k === "land");
  const isAllSea = kinds.length > 0 && kinds.every(k => k === "sea");
  const composition: RouteComposition = isAllLand ? "land" : isAllSea ? "sea" : "mixed";

  const gradeProfile = isAllLand
    ? buildRouteGradeProfileFromPoints(cellPoints(cells), {
        distanceScale: ctx.distanceScale,
        heightExponent: ctx.heightExponent,
        heights: ctx.heights
      })
    : null;

  return {
    mode,
    cells,
    kinds,
    composition,
    distanceKm: landDistanceKm + seaDistanceKm,
    landDistanceKm,
    seaDistanceKm,
    durationDays: pathResult.days + transitions * PORT_TRANSFER_PENALTY_DAYS,
    ascentM: gradeProfile ? gradeProfile.totalAscentM : ascentM,
    descentM: gradeProfile ? gradeProfile.totalDescentM : descentM,
    gradeProfile,
    seaRequiredDespiteAvoid
  };
}

function computeModeRoute(
  mode: TravelMode,
  fromCell: number,
  toCell: number,
  avoidSea: boolean,
  graphs: { land: LandRouteGraph; sea: SeaRouteGraph },
  ctx: { distanceScale: number; heightExponent: number; heights: ArrayLike<number> }
): ModeResult {
  const config = LAND_MODE_CONFIG[mode];

  const landDayCost = (from: number, to: number, planarDist: number) => {
    const effort = landEdgeEffortCost(from, to, planarDist, {
      distanceScale: ctx.distanceScale,
      heightExponent: ctx.heightExponent,
      heights: ctx.heights,
      gradeEffectStrength: 1,
      sensitivity: config.sensitivity
    });
    return (effort * ctx.distanceScale) / config.kmPerDay;
  };
  const seaDayCost = (planarDist: number) => (planarDist * ctx.distanceScale) / SHIP_KM_PER_DAY;

  let seaRequiredDespiteAvoid = false;
  let result = findMergedRoutePath(
    graphs.land,
    avoidSea ? null : graphs.sea,
    fromCell,
    toCell,
    landDayCost,
    seaDayCost
  );

  if (!result && avoidSea) {
    result = findMergedRoutePath(graphs.land, graphs.sea, fromCell, toCell, landDayCost, seaDayCost);
    if (result) seaRequiredDespiteAvoid = true;
  }

  if (!result) return { available: false, reasonKey: "noRoute" };

  return { available: true, route: buildDirectionsRoute(mode, result, ctx, seaRequiredDespiteAvoid) };
}

/** Resolves a burg id to a live, non-removed Burg, or null. */
export function resolveBurg(burgId: number | null | undefined): Burg | null {
  if (!burgId) return null;
  const burg = worldContext.pack.burgs?.[burgId];
  if (!burg || burg.removed) return null;
  return burg;
}

/**
 * Computes directions between two burgs for every transport mode. Each mode searches the
 * combined land+sea network for its fastest route (see module doc comment) — a sea leg is used
 * automatically when it's part of the fastest path, and `avoidSea` restricts the search to land
 * only (falling back to a sea-inclusive route, flagged via `seaRequiredDespiteAvoid`, if no
 * land-only path exists at all).
 */
export function computeDirections(fromBurgId: number, toBurgId: number, avoidSea = false): DirectionsResult | null {
  const fromBurg = resolveBurg(fromBurgId);
  const toBurg = resolveBurg(toBurgId);
  if (!fromBurg || !toBurg) return null;

  const fromCell = fromBurg.cell;
  const toCell = toBurg.cell;

  if (fromCell === toCell) {
    const sameLocation: ModeResult = { available: false, reasonKey: "sameLocation" };
    return { foot: sameLocation, mounted: sameLocation, wagon: sameLocation };
  }

  const graphs = { land: buildLandRouteGraph(worldContext.pack), sea: buildSeaRouteGraph(worldContext.pack) };
  const ctx = {
    distanceScale: resolveDistanceScale(),
    heightExponent: resolveHeightExponent(),
    heights: worldContext.pack.cells.h
  };

  return {
    foot: computeModeRoute("foot", fromCell, toCell, avoidSea, graphs, ctx),
    mounted: computeModeRoute("mounted", fromCell, toCell, avoidSea, graphs, ctx),
    wagon: computeModeRoute("wagon", fromCell, toCell, avoidSea, graphs, ctx)
  };
}

/** Splits a continuous day count into days/hours/minutes for human-readable display. */
export function splitTravelDuration(days: number): { days: number; hours: number; minutes: number } {
  if (!Number.isFinite(days) || days <= 0) return { days: 0, hours: 0, minutes: 0 };
  const totalMinutes = Math.round(days * 24 * 60);
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor((totalMinutes % (24 * 60)) / 60),
    minutes: totalMinutes % 60
  };
}

/** Tie-break order when two available modes have the same duration. */
const DEFAULT_MODE_PRIORITY: readonly TravelMode[] = ["wagon", "mounted", "foot"];

/** The available mode with the lowest travel time, or null if every mode is unavailable. */
export function pickDefaultMode(result: DirectionsResult): TravelMode | null {
  let winner: TravelMode | null = null;
  let winnerDays = Infinity;

  for (const mode of DEFAULT_MODE_PRIORITY) {
    const modeResult = result[mode];
    if (!modeResult.available) continue;
    if (modeResult.route.durationDays < winnerDays) {
      winner = mode;
      winnerDays = modeResult.route.durationDays;
    }
  }

  return winner;
}
