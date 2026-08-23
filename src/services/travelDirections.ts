/**
 * Burg-to-burg travel directions: distance, elevation, and travel time along the charted
 * road/trail/sea-route network, per transport mode (foot / horse-cart / ship). Backs the
 * map-context-menu "Distance to/from {burg}" flow (src/controllers/mapContextMenu.ts) — see
 * docs/plan/burg-directions.md.
 *
 * Deliberately fully core (no dependency on the economy extension's TradeAnimation pathfinder or
 * CaravanMovement settings) so it keeps working with that extension disabled: each mode queries
 * its own single network directly via landRouteGraph.ts / seaRouteGraph.ts, both already core.
 * Speed constants below are declared locally rather than imported from the economy extension —
 * they intentionally match its CaravanMovement defaults for consistency, but are restated so this
 * module has no runtime dependency on it.
 */

import { worldContext } from "../context/worldContext";
import { buildLandRouteGraph, findLandRoutePath } from "../generators/landRouteGraph";
import { buildSeaRouteGraph, findSeaRoutePath } from "../generators/seaRouteGraph";
import { useOptionsState } from "../store/optionsState";
import type { Burg } from "../types/models";
import { normalizeHeightExponent } from "../utils/height";
import {
  buildRouteGradeProfileFromPoints,
  calculateLandTravelDays,
  DEFAULT_HORSE_GRADE_SENSITIVITY,
  DEFAULT_INFANTRY_GRADE_SENSITIVITY,
  type GradeSensitivity,
  landEdgeEffortCost,
  type RouteGradeProfile
} from "./routeGrade";

export type TravelMode = "foot" | "wagon" | "ship";

export const TRAVEL_MODES: readonly TravelMode[] = ["foot", "wagon", "ship"];

export type RouteLabelKey = "recommended" | "shortest" | "easier";

export interface DirectionsRoute {
  id: string;
  mode: TravelMode;
  labelKey: RouteLabelKey;
  /** Ordered cell path, both endpoints inclusive. */
  cells: number[];
  distanceKm: number;
  /** Continuous travel time — not ceiled to a whole simulation day (see formatTravelDuration). */
  durationDays: number;
  ascentM: number;
  descentM: number;
  /** Grade profile for land modes; null for ship (no grade concept). */
  gradeProfile: RouteGradeProfile | null;
}

export type ModeResult =
  | { available: true; routes: DirectionsRoute[] }
  | { available: false; reasonKey: "noLandRoute" | "noSeaRoute" | "sameLocation" };

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
/** Matches economy's CaravanMovement DEFAULT_MOVEMENT_SETTINGS.seaKmPerDay. */
const SHIP_KM_PER_DAY = 60;

const LAND_MODE_CONFIG: Record<Exclude<TravelMode, "ship">, LandModeConfig> = {
  foot: { kmPerDay: FOOT_KM_PER_DAY, sensitivity: DEFAULT_INFANTRY_GRADE_SENSITIVITY },
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

function pathsEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((cell, i) => cell === b[i]);
}

function buildLandDirectionsRoute(
  mode: Exclude<TravelMode, "ship">,
  cells: number[],
  labelKey: RouteLabelKey
): DirectionsRoute {
  const config = LAND_MODE_CONFIG[mode];
  const distanceScale = resolveDistanceScale();
  const heightExponent = resolveHeightExponent();
  const heights = worldContext.pack.cells.h;
  const points = cellPoints(cells);

  const gradeProfile = buildRouteGradeProfileFromPoints(points, { distanceScale, heightExponent, heights });
  const durationDays = calculateLandTravelDays(points, {
    distanceScale,
    heightExponent,
    heights,
    landKmPerDay: config.kmPerDay,
    gradeEffectStrength: 1,
    sensitivity: config.sensitivity
  });

  return {
    id: `${mode}-${labelKey}`,
    mode,
    labelKey,
    cells,
    distanceKm: gradeProfile.planarKm,
    durationDays,
    ascentM: gradeProfile.totalAscentM,
    descentM: gradeProfile.totalDescentM,
    gradeProfile
  };
}

function computeLandMode(mode: Exclude<TravelMode, "ship">, fromCell: number, toCell: number): ModeResult {
  const graph = buildLandRouteGraph(worldContext.pack);
  const shortestCells = findLandRoutePath(graph, fromCell, toCell);
  if (!shortestCells) return { available: false, reasonKey: "noLandRoute" };

  const config = LAND_MODE_CONFIG[mode];
  const distanceScale = resolveDistanceScale();
  const heightExponent = resolveHeightExponent();
  const heights = worldContext.pack.cells.h;
  const easierCells = findLandRoutePath(graph, fromCell, toCell, (from, to, planarDist) =>
    landEdgeEffortCost(from, to, planarDist, {
      distanceScale,
      heightExponent,
      heights,
      gradeEffectStrength: 1,
      sensitivity: config.sensitivity
    })
  );

  if (!easierCells || pathsEqual(shortestCells, easierCells)) {
    return { available: true, routes: [buildLandDirectionsRoute(mode, shortestCells, "recommended")] };
  }

  const shortestRoute = buildLandDirectionsRoute(mode, shortestCells, "shortest");
  const easierRoute = buildLandDirectionsRoute(mode, easierCells, "easier");
  // Whichever is actually faster leads the list.
  const routes =
    easierRoute.durationDays < shortestRoute.durationDays ? [easierRoute, shortestRoute] : [shortestRoute, easierRoute];
  return { available: true, routes };
}

function computeShipMode(fromCell: number, toCell: number): ModeResult {
  const graph = buildSeaRouteGraph(worldContext.pack);
  const cells = findSeaRoutePath(graph, fromCell, toCell);
  if (!cells) return { available: false, reasonKey: "noSeaRoute" };

  const distanceScale = resolveDistanceScale();
  const p = worldContext.pack.cells.p;
  let distanceMapUnits = 0;
  for (let i = 0; i < cells.length - 1; i++) {
    const [x1, y1] = p[cells[i]];
    const [x2, y2] = p[cells[i + 1]];
    distanceMapUnits += Math.hypot(x2 - x1, y2 - y1);
  }
  const distanceKm = distanceMapUnits * distanceScale;
  const durationDays = SHIP_KM_PER_DAY > 0 ? distanceKm / SHIP_KM_PER_DAY : Infinity;

  return {
    available: true,
    routes: [
      {
        id: "ship-recommended",
        mode: "ship",
        labelKey: "recommended",
        cells,
        distanceKm,
        durationDays,
        ascentM: 0,
        descentM: 0,
        gradeProfile: null
      }
    ]
  };
}

/** Resolves a burg id to a live, non-removed Burg, or null. */
export function resolveBurg(burgId: number | null | undefined): Burg | null {
  if (!burgId) return null;
  const burg = worldContext.pack.burgs?.[burgId];
  if (!burg || burg.removed) return null;
  return burg;
}

/**
 * Computes directions between two burgs for every transport mode. Each mode is queried against
 * its own network independently (see module doc comment) — a mode unreachable in one network
 * is reported unavailable rather than falling back to a mixed route.
 */
export function computeDirections(fromBurgId: number, toBurgId: number): DirectionsResult | null {
  const fromBurg = resolveBurg(fromBurgId);
  const toBurg = resolveBurg(toBurgId);
  if (!fromBurg || !toBurg) return null;

  const fromCell = fromBurg.cell;
  const toCell = toBurg.cell;

  if (fromCell === toCell) {
    const sameLocation: ModeResult = { available: false, reasonKey: "sameLocation" };
    return { foot: sameLocation, wagon: sameLocation, ship: sameLocation };
  }

  return {
    foot: computeLandMode("foot", fromCell, toCell),
    wagon: computeLandMode("wagon", fromCell, toCell),
    ship: computeShipMode(fromCell, toCell)
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

/** Best (lowest-duration) route across a mode's alternates, or null if the mode is unavailable. */
export function bestRoute(result: ModeResult): DirectionsRoute | null {
  if (!result.available || result.routes.length === 0) return null;
  return result.routes.reduce((best, r) => (r.durationDays < best.durationDays ? r : best), result.routes[0]);
}

/** Tie-break order when two available modes have the same best duration. */
const DEFAULT_MODE_PRIORITY: readonly TravelMode[] = ["wagon", "foot", "ship"];

/** The available mode with the lowest travel time, or null if every mode is unavailable. */
export function pickDefaultMode(result: DirectionsResult): TravelMode | null {
  let winner: TravelMode | null = null;
  let winnerDays = Infinity;

  for (const mode of DEFAULT_MODE_PRIORITY) {
    const route = bestRoute(result[mode]);
    if (!route) continue;
    if (route.durationDays < winnerDays) {
      winner = mode;
      winnerDays = route.durationDays;
    }
  }

  return winner;
}
