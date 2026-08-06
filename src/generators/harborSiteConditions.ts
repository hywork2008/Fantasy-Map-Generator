/**
 * Elevation and Depth siting/quality conditions for formal harbors and shipyards.
 * See docs/plan/harbor-siting.md for the full design (thresholds, rationale, wiring plan).
 *
 * Elevation is the land-side burg cell's height, converted to meters via the shared
 * `heightToMeters()` (so thresholds stay correct across `heightExponent` settings). Depth is the
 * adjacent water's depth, but never read directly off `pack.cells.haven` — `defineHaven()`
 * (`features.ts`) always picks the *closest* water cell, which is definitionally the shallowest,
 * so a short BFS out from `haven` is used instead to find how deep the nearby water actually
 * gets (`findNearbyMaxDepthMeters()`).
 *
 * Both conditions follow the same "don't drop candidates to zero" policy as the rest of the
 * harbor system: only Elevation's Unsuitable tier (>100m — no feasible footing at all) is a hard
 * candidate-gate exclusion. Elevation's Marginal tier and every Depth tier instead degrade
 * capacity (`elevationFactor`, tiered `large` capacity) rather than excluding the burg outright.
 */

import type { PackedGraph } from "../types/PackedGraph";
import { isWater } from "../utils/graphUtils";
import { depthToMeters, heightToMeters } from "../utils/height";
import { lerp } from "../utils/numberUtils";

export type HarborElevationTier = "ideal" | "marginal" | "unsuitable";

export interface HarborElevationEvaluation {
  /** Land-side elevation in meters (via `heightToMeters()`), always >= 0. */
  elevationM: number;
  tier: HarborElevationTier;
  /** Capacity multiplier: 1 for ideal, lerp(1, floor) across marginal, floor for unsuitable. */
  elevationFactor: number;
}

/** Ideal / Marginal boundary (meters). At or below this, no elevation penalty applies. */
export const HARBOR_ELEVATION_IDEAL_MAX_M = 30;
/** Marginal / Unsuitable boundary (meters). Above this, formal harbors/shipyards are excluded. */
export const HARBOR_ELEVATION_UNSUITABLE_MIN_M = 100;
/** `elevationFactor` floor reached at the Unsuitable boundary (never lower, even for gated cells). */
export const ELEVATION_FACTOR_FLOOR = 0.4;

/** Required nearby water depth (meters) to fully unlock each ship-size tier. */
export const HARBOR_DEPTH_SMALL_MIN_M = 2;
export const HARBOR_DEPTH_MEDIUM_MIN_M = 4;
/** Below this, the large tier is closed outright (not even at reduced capacity). */
export const HARBOR_DEPTH_LARGE_MARGINAL_MIN_M = 4;
/** At/above this, the large tier is unlocked at full capacity (no dredging penalty). */
export const HARBOR_DEPTH_LARGE_MIN_M = 6;

/** BFS hop radius (from `haven`) used to search for nearby depth, one per ship-size tier. */
export const HARBOR_DEPTH_SEARCH_RADIUS_SMALL = 1;
export const HARBOR_DEPTH_SEARCH_RADIUS_MEDIUM = 2;
export const HARBOR_DEPTH_SEARCH_RADIUS_LARGE = 3;

/**
 * Classify a burg's land-side elevation into ideal/marginal/unsuitable tiers, with the capacity
 * multiplier to apply at that elevation. `hIndex` is `pack.cells.h[burg.cell]` — a single sampled
 * value per cell (`reGraph()`, `main.ts`), not an area mean/median, so no aggregation is needed.
 */
export function evaluateHarborElevation(hIndex: number, heightExponent: number): HarborElevationEvaluation {
  const elevationM = heightToMeters(hIndex, heightExponent);

  if (elevationM <= HARBOR_ELEVATION_IDEAL_MAX_M) {
    return { elevationM, tier: "ideal", elevationFactor: 1 };
  }

  if (elevationM <= HARBOR_ELEVATION_UNSUITABLE_MIN_M) {
    const t =
      (elevationM - HARBOR_ELEVATION_IDEAL_MAX_M) / (HARBOR_ELEVATION_UNSUITABLE_MIN_M - HARBOR_ELEVATION_IDEAL_MAX_M);
    return { elevationM, tier: "marginal", elevationFactor: lerp(1, ELEVATION_FACTOR_FLOOR, t) };
  }

  return { elevationM, tier: "unsuitable", elevationFactor: ELEVATION_FACTOR_FLOOR };
}

/**
 * BFS outward from `havenCellId` through water-only neighbors, up to `radiusHops`, returning the
 * deepest water found (meters, positive magnitude) — `haven` itself counts as hop 0. Reuses the
 * same "water-only BFS" pattern as `calculateEnclosure()` / `waterDepthTrend()`
 * (`features.ts` / `coastalHabitatAssignment.ts`).
 *
 * Returns 0 if `havenCellId` is falsy/not water (defensive — callers should already have checked
 * `cells.haven[burg.cell]` is set before calling this).
 */
export function findNearbyMaxDepthMeters(pack: PackedGraph, havenCellId: number, radiusHops: number): number {
  const { h, c: neighbors } = pack.cells;
  if (!havenCellId || !isWater(havenCellId, pack)) return 0;

  let maxDepthM = Math.abs(depthToMeters(h[havenCellId]));
  let frontier = [havenCellId];
  const visited = new Set<number>([havenCellId]);

  for (let hop = 0; hop < radiusHops && frontier.length; hop++) {
    const nextFrontier: number[] = [];
    for (const cellId of frontier) {
      for (const neighborId of neighbors[cellId] ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        if (!isWater(neighborId, pack)) continue;

        const depthM = Math.abs(depthToMeters(h[neighborId]));
        if (depthM > maxDepthM) maxDepthM = depthM;
        nextFrontier.push(neighborId);
      }
    }
    frontier = nextFrontier;
  }

  return maxDepthM;
}

export interface HarborDepthProfile {
  /** Deepest water within HARBOR_DEPTH_SEARCH_RADIUS_SMALL hops of `haven` (meters). */
  smallDepthM: number;
  /** Deepest water within HARBOR_DEPTH_SEARCH_RADIUS_MEDIUM hops of `haven` (meters). */
  mediumDepthM: number;
  /** Deepest water within HARBOR_DEPTH_SEARCH_RADIUS_LARGE hops of `haven` (meters). */
  largeDepthM: number;
}

/** Depth profile for all three ship-size search radii around a burg's haven cell. */
export function evaluateHarborDepth(pack: PackedGraph, havenCellId: number): HarborDepthProfile {
  return {
    smallDepthM: findNearbyMaxDepthMeters(pack, havenCellId, HARBOR_DEPTH_SEARCH_RADIUS_SMALL),
    mediumDepthM: findNearbyMaxDepthMeters(pack, havenCellId, HARBOR_DEPTH_SEARCH_RADIUS_MEDIUM),
    largeDepthM: findNearbyMaxDepthMeters(pack, havenCellId, HARBOR_DEPTH_SEARCH_RADIUS_LARGE)
  };
}

/**
 * Large-tier capacity multiplier from nearby depth: 0 below the marginal floor, 0.5 in the
 * dredging-maintenance marginal band, 1 once genuinely deep water is nearby. Small/medium tiers
 * are not similarly gated to zero — see docs/plan/harbor-siting.md §4 ("don't drop harbor
 * facilities to zero").
 */
export function computeLargeDepthShareMultiplier(largeDepthM: number): number {
  if (largeDepthM < HARBOR_DEPTH_LARGE_MARGINAL_MIN_M) return 0;
  if (largeDepthM < HARBOR_DEPTH_LARGE_MIN_M) return 0.5;
  return 1;
}
