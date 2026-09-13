import { worldContext } from "../../context/worldContext";
import type { RNGService } from "../../utils/probabilityUtils";
import {
  demographicTotal,
  getBurgDemographics,
  getCellDemographics,
  setBurgDemographics,
  setCellDemographics
} from "../demographicTransfer";
import type { DemographicsSimulationResult } from "../demography-simulator";
import { annualGrowthFactor, jitterFactor } from "./fastAdvanceMath";
import type { FastAdvanceRates } from "./fastAdvancePresets";

const EMPTY_DEMOGRAPHICS_RESULT: DemographicsSimulationResult = Object.freeze({
  bordersChanged: false,
  newBurgsAdded: false,
  routesAdded: false,
  promotedSettlements: Object.freeze([]) as readonly never[]
});

/**
 * Fast-Forward's replacement for simulateDemographics() (docs/plan/advance-time-fast-forward.md
 * §4.4). Applies a flat annual growth rate (with per-cell/per-burg jitter) instead of the real
 * cohort-aging / births / migration / carrying-capacity model.
 *
 * Writes through setCellDemographics / setBurgDemographics so the cached totals (`cells.pop`,
 * `burg.population`) stay in lockstep with the four age/sex buckets — the same contract
 * simulateDemographics() honours. Burgs without a `demographics` object (stubs) still scale
 * `population` alone.
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
  const { pack } = worldContext;
  if (!pack?.cells || !pack.burgs || !(deltaYears > 0)) return EMPTY_DEMOGRAPHICS_RESULT;

  const growth = annualGrowthFactor(rates.populationGrowthPctPerYear, deltaYears);

  for (const i of pack.cells.i) {
    const buckets = getCellDemographics(pack.cells, i);
    if (!(demographicTotal(buckets) > 0)) continue;
    const factor = Math.max(0, growth * jitterFactor(rng, rates.variancePct, deltaYears));
    setCellDemographics(pack.cells, i, {
      children: buckets.children * factor,
      maleAdults: buckets.maleAdults * factor,
      femaleAdults: buckets.femaleAdults * factor,
      elders: buckets.elders * factor
    });
  }

  for (const burg of pack.burgs) {
    if (!burg?.i || burg.removed || !((burg.population ?? 0) > 0)) continue;
    const factor = Math.max(0, growth * jitterFactor(rng, rates.variancePct, deltaYears));
    if (burg.demographics) {
      const buckets = getBurgDemographics(burg);
      setBurgDemographics(burg, {
        children: buckets.children * factor,
        maleAdults: buckets.maleAdults * factor,
        femaleAdults: buckets.femaleAdults * factor,
        elders: buckets.elders * factor
      });
    } else {
      burg.population = (burg.population ?? 0) * factor;
    }
  }

  return EMPTY_DEMOGRAPHICS_RESULT;
}

export function emptyFastForwardDemographicsResult(): DemographicsSimulationResult {
  return EMPTY_DEMOGRAPHICS_RESULT;
}
