/** The historical demographic split used by rankCells() for every populated cell. */
export interface InitialPopulationCohorts {
  readonly population: number;
  readonly children: number;
  readonly maleAdults: number;
  readonly femaleAdults: number;
  readonly elders: number;
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
