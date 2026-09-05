import { worldContext } from "../../context/worldContext";
import type { RNGService } from "../../utils/probabilityUtils";
import type { DemographicsSimulationResult } from "../demography-simulator";
import type { FastAdvanceRates } from "./fastAdvancePresets";

/**
 * Fast-Forward's replacement for simulateDemographics() (docs/plan/advance-time-fast-forward.md
 * §4.4). Applies a flat annual growth rate (with per-cell/per-burg jitter) instead of the real
 * cohort-aging / births / migration / carrying-capacity model.
 *
 * Deliberately drops simulateDemographics()'s land-carrying-capacity constraint (no migration, no
 * starvation) — an explicit, documented limitation of approximate mode (§4.4). A negative
 * populationGrowthPctPerYear (Decline/Collapse presets) is how an overcrowded scenario is expressed
 * here instead. Rural-to-urban drift is not modeled in v1 (ratios stay fixed) — see §10.
 *
 * Returns the same DemographicsSimulationResult shape as simulateDemographics() (all empty/false)
 * so callers can branch between the two without changing the result type — Fast-Forward never
 * grows new burgs, shifts borders, or adds routes.
 */
export function applyFastForwardPopulation(
  deltaYears: number,
  rates: FastAdvanceRates,
  rng: RNGService
): DemographicsSimulationResult {
  const empty: DemographicsSimulationResult = {
    bordersChanged: false,
    newBurgsAdded: false,
    routesAdded: false,
    promotedSettlements: []
  };

  const { pack } = worldContext;
  if (!pack?.cells || !pack.burgs || !(deltaYears > 0)) return empty;

  const growth = (1 + rates.populationGrowthPctPerYear / 100) ** deltaYears;
  // This is called once per calendar day (timeEngine.ts calls it in place of core:demographics, at
  // the same daily cadence), each time with deltaYears ≈ 1/365 — so a full Advance Year draws ~365
  // independent per-cell/per-burg jitter multipliers. Compounding that many independent
  // mean-1 multiplicative factors without correction is *not* mean-1 overall: by Jensen's
  // inequality the geometric mean of a symmetric-in-linear-space distribution is below 1, so
  // repeated compounding drives most cells/burgs toward collapse while a rare "lucky streak" of
  // draws explodes a handful of others — confirmed live (docs/plan/advance-time-fast-forward.md
  // §9 finding: a Boom-preset Advance Year collapsed most burgs' population while a few grew
  // several-fold, nothing like the intended uniform growth). Scaling the jitter amplitude by
  // sqrt(deltaYears) keeps the *variance* of the fully-compounded result (over however many calls
  // make up one year, or one single call spanning many years) consistent with a single
  // one-shot annual draw at the preset's stated variancePct, however this function ends up
  // getting called.
  const jitterAmplitude = (rates.variancePct / 100) * Math.sqrt(deltaYears);
  const jitterFactor = (rngService: RNGService) => 1 + (rngService.rand() * 2 - 1) * jitterAmplitude;

  for (const i of pack.cells.i) {
    if (!(pack.cells.pop[i] > 0)) continue;
    const factor = Math.max(0, growth * jitterFactor(rng));
    pack.cells.children[i] *= factor;
    pack.cells.maleAdults[i] *= factor;
    pack.cells.femaleAdults[i] *= factor;
    pack.cells.elders[i] *= factor;
  }

  for (const burg of pack.burgs) {
    if (!burg?.i || burg.removed || !((burg.population ?? 0) > 0)) continue;
    const factor = Math.max(0, growth * jitterFactor(rng));
    burg.population = (burg.population ?? 0) * factor;
  }

  return empty;
}
