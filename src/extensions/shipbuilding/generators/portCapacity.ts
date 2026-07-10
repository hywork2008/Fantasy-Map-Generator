import type { Burg } from "../../hostTypes";
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
 * purely from existing population/harbor/status data — see docs/plan/ships.md
 * ("港湾収容力（暫定案）") for the full derivation and worked examples. Pure derived
 * data, recomputed alongside `computeShipyardCandidates()`; never written back to
 * `pack.burgs`.
 */
export function computePortCapacity(candidates: readonly ShipyardCandidate[]): Map<number, PortCapacity> {
  const { pack, populationRate, urbanization } = getWorldContext();
  const capacityByBurg = new Map<number, PortCapacity>();

  for (const { burgId } of candidates) {
    const burg = pack.burgs[burgId];
    if (!burg || burg.removed) continue;

    capacityByBurg.set(burgId, computeBurgPortCapacity(burg, pack.cells.harbor, populationRate, urbanization));
  }

  return capacityByBurg;
}

function computeBurgPortCapacity(
  burg: Burg,
  harborByCell: ArrayLike<number>,
  populationRate: number,
  urbanization: number
): PortCapacity {
  const realPopulation = (burg.population ?? 0) * populationRate * urbanization;
  const basePortScore = POWER_LAW_COEFFICIENT * realPopulation ** POWER_LAW_EXPONENT;

  const harborQuality = Math.min(harborByCell[burg.cell] ?? 0, MAX_HARBOR_QUALITY);
  const harborFactor = Math.max(harborQuality, 1) / MAX_HARBOR_QUALITY;

  let total = basePortScore * (HARBOR_FACTOR_FLOOR + (1 - HARBOR_FACTOR_FLOOR) * harborFactor);
  if (burg.capital) total *= CAPITAL_MULTIPLIER;
  if (burg.citadel) total *= CITADEL_MULTIPLIER;

  const small = Math.max(1, Math.floor(total));
  const medium = total >= MEDIUM_MIN_TOTAL ? Math.floor(total * MEDIUM_SHARE) : 0;
  const large =
    total >= LARGE_MIN_TOTAL && harborFactor >= LARGE_MIN_HARBOR_FACTOR ? Math.floor(total * LARGE_SHARE) : 0;

  return { small, medium, large };
}
