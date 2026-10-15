import { simulationContext } from "../../context/simulationContext";
import { worldContext } from "../../context/worldContext";
import {
  getColdExposure,
  getColdPopulationPenaltyPct,
  normalizeClimateVariability
} from "../../utils/climateVariability";
import type { RNGService } from "../../utils/probabilityUtils";
import { createCellClimateNormalsReader } from "../cellClimateNormals";
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
  // The skipped economy would have turned cold-episode harvest failures into famine deaths
  // (docs/plan/wind-aspect-climate-variability.md §4.4); stand in for that per cell.
  const coldPenalty = createColdPenaltyReader(rates.populationGrowthPctPerYear, deltaYears);
  const growthAt = (cellId: number) => coldPenalty?.(cellId) ?? growth;

  for (const i of pack.cells.i) {
    const buckets = getCellDemographics(pack.cells, i);
    if (!(demographicTotal(buckets) > 0)) continue;
    const factor = Math.max(0, growthAt(i) * jitterFactor(rng, rates.variancePct, deltaYears));
    setCellDemographics(pack.cells, i, {
      children: buckets.children * factor,
      maleAdults: buckets.maleAdults * factor,
      femaleAdults: buckets.femaleAdults * factor,
      elders: buckets.elders * factor
    });
  }

  for (const burg of pack.burgs) {
    if (!burg?.i || burg.removed || !((burg.population ?? 0) > 0)) continue;
    const factor = Math.max(0, growthAt(burg.cell) * jitterFactor(rng, rates.variancePct, deltaYears));
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

/** Per pack cell growth factor including the cold penalty; undefined when no cold episode is active. */
function createColdPenaltyReader(
  growthPctPerYear: number,
  deltaYears: number
): ((packCellId: number) => number) | undefined {
  const world = worldContext;
  if (normalizeClimateVariability(world.options?.climateVariability).start === "off") return undefined;
  if (!world.grid?.cells?.i?.length || !world.grid.points?.length || !(world.graphHeight > 0)) return undefined;
  const read = createCellClimateNormalsReader(world, simulationContext.currentYear || 2001);
  const cache = new Map<number, number>();
  return packCellId => {
    const gridCellId = world.pack.cells.g?.[packCellId] ?? packCellId;
    const cached = cache.get(gridCellId);
    if (cached !== undefined) return cached;
    const normals = read(gridCellId);
    const penalty = normals
      ? getColdPopulationPenaltyPct(getColdExposure(normals.monthlyMeanTemperatureC, normals.climateAnomalyC))
      : 0;
    const factor = annualGrowthFactor(growthPctPerYear - penalty, deltaYears);
    cache.set(gridCellId, factor);
    return factor;
  };
}

export function emptyFastForwardDemographicsResult(): DemographicsSimulationResult {
  return EMPTY_DEMOGRAPHICS_RESULT;
}
