import {
  computeLargeDepthShareMultiplier,
  evaluateHarborDepth,
  evaluateHarborElevation
} from "../../../generators/harborSiteConditions";
import { normalizeHeightExponent } from "../../../utils/height";
import { useOptionsState } from "../../hostCore";
import type { Burg, PackedGraph } from "../../hostTypes";
import { getWorldContext } from "../shipbuildingContext";
import type { ShipyardCandidate } from "./shipyardCandidates";

export interface PortCapacity {
  small: number;
  medium: number;
  large: number;
}

// All tunable placeholder constants for the provisional formula in docs/plan/ships.md
// ("港湾収容力（暫定案）") — adjust here as balance data comes in, nowhere else.
const POWER_LAW_COEFFICIENT = 0.3;
const POWER_LAW_EXPONENT = 0.35;
const MAX_HARBOR_QUALITY = 6;
const HARBOR_FACTOR_FLOOR = 0.5; // even a poor harbor keeps at least this share of basePortScore
const CAPITAL_MULTIPLIER = 1.5;
const CITADEL_MULTIPLIER = 1.25;
const MEDIUM_SHARE = 0.35;
const MEDIUM_MIN_TOTAL = 3;
const LARGE_SHARE = 0.12;
const LARGE_MIN_TOTAL = 8;
const LARGE_MIN_HARBOR_FACTOR = 0.5;

/**
 * Provisional per-burg port capacity (max ships moored at once, by size tier), derived
 * purely from existing population/harbor/status data plus the Elevation/Depth siting
 * conditions — see docs/plan/ships.md ("港湾収容力（暫定案）") for the base derivation and
 * docs/plan/harbor-siting.md §4 for the elevationFactor / depth-tiered large capacity added
 * on top. Pure derived data, recomputed alongside `computeShipyardCandidates()`; never written
 * back to `pack.burgs`.
 */
export function computePortCapacity(candidates: readonly ShipyardCandidate[]): Map<number, PortCapacity> {
  const { pack, populationRate, urbanization } = getWorldContext();
  const heightExponent = normalizeHeightExponent(useOptionsState.getState().heightExponent);
  const capacityByBurg = new Map<number, PortCapacity>();

  for (const { burgId } of candidates) {
    const burg = pack.burgs[burgId];
    if (!burg || burg.removed) continue;

    capacityByBurg.set(burgId, computeBurgPortCapacity(burg, pack, populationRate, urbanization, heightExponent));
  }

  return capacityByBurg;
}

function computeBurgPortCapacity(
  burg: Burg,
  pack: PackedGraph,
  populationRate: number,
  urbanization: number,
  heightExponent: number
): PortCapacity {
  const { cells } = pack;
  const realPopulation = (burg.population ?? 0) * populationRate * urbanization;
  const basePortScore = POWER_LAW_COEFFICIENT * realPopulation ** POWER_LAW_EXPONENT;

  const harborQuality = Math.min(cells.harbor[burg.cell] ?? 0, MAX_HARBOR_QUALITY);
  const harborFactor = Math.max(harborQuality, 1) / MAX_HARBOR_QUALITY;

  // Elevation Marginal (30-100m) degrades total capacity via elevationFactor instead of gating
  // the candidate outright — Unsuitable (>100m) is already excluded upstream in
  // computeShipyardCandidates(), so elevationFactor here is always in [ELEVATION_FACTOR_FLOOR, 1].
  const { elevationFactor } = evaluateHarborElevation(cells.h[burg.cell], heightExponent);

  let total = basePortScore * (HARBOR_FACTOR_FLOOR + (1 - HARBOR_FACTOR_FLOOR) * harborFactor) * elevationFactor;
  if (burg.capital) total *= CAPITAL_MULTIPLIER;
  if (burg.citadel) total *= CITADEL_MULTIPLIER;

  const small = Math.max(1, Math.floor(total));
  const medium = total >= MEDIUM_MIN_TOTAL ? Math.floor(total * MEDIUM_SHARE) : 0;

  // Depth-tiered large capacity: below HARBOR_DEPTH_LARGE_MARGINAL_MIN_M the large tier stays
  // closed; the 4-6m band opens it at half capacity (dredging-maintenance band); 6m+ opens it at
  // full capacity. Small/medium are not depth-gated — see docs/plan/harbor-siting.md §4.2.
  const { largeDepthM } = evaluateHarborDepth(pack, cells.haven[burg.cell]);
  const largeDepthMultiplier = computeLargeDepthShareMultiplier(largeDepthM);
  const large =
    total >= LARGE_MIN_TOTAL && harborFactor >= LARGE_MIN_HARBOR_FACTOR
      ? Math.floor(total * LARGE_SHARE * largeDepthMultiplier)
      : 0;

  return { small, medium, large };
}
