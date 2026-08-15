/** The historical demographic split used by rankCells() for every populated cell. */
export interface InitialPopulationCohorts {
  readonly population: number;
  readonly children: number;
  readonly maleAdults: number;
  readonly femaleAdults: number;
  readonly elders: number;
}

/**
 * New maps start below subsistence carrying capacity K so logistic births have
 * room. Spec: docs/simulation/population-dynamics.md §1.
 */
export const INITIAL_POPULATION_FRACTION_OF_K = 0.6;

/**
 * Per-cell fill of K for a newly generated oikoumene. Never packs settled
 * cells to 100% of K — when footprint ≈ saturation that used to zero
 * `roomForGrowth` on day one. A requested global saturation below this
 * still produces a thinner start.
 */
export function startingPopulationScaleOfK(settledCapacity: number, totalCapacity: number, saturation: number): number {
  if (settledCapacity <= 0) return 0;
  const requested = (Math.max(0, totalCapacity) * Math.max(0, saturation)) / settledCapacity;
  return Math.min(INITIAL_POPULATION_FRACTION_OF_K, requested);
}

/**
 * Produces the pre-frontier initial population distribution for one suitable
 * cell. Keeping this calculation pure gives Phase 1 a small internal seam
 * without changing the current standard generation result.
 */
export function createInitialPopulationCohorts(
  capacity: number,
  initialPopulationSaturation: number
): InitialPopulationCohorts {
  const population = capacity * initialPopulationSaturation;
  return {
    population,
    children: population * 0.4,
    maleAdults: population * 0.2205,
    femaleAdults: population * 0.2295,
    elders: population * 0.15
  };
}
