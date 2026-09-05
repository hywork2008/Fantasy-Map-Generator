import { getRaceFertility, getRaceLifespan } from "../data/races";
import type { Race } from "../types/models";

/** Labels for the three age cohorts shown in a burg population pyramid. */
export interface PopulationAgeBands {
  elders: string;
  adults: string;
  children: string;
}

/** Existing human-oriented labels, also used when a city's population is mixed. */
export const DEFAULT_POPULATION_AGE_BANDS: PopulationAgeBands = {
  elders: "50+",
  adults: "15-50",
  children: "0-14"
};

const HUMAN_MATURITY_AGE = 16;
const HUMAN_LIFESPAN = 75;
const HUMAN_ELDER_AGE = 50;

/**
 * Maps the established human elder threshold onto a race's maturity-to-lifespan span.
 * This keeps adulthood anchored to the race's configured fertility start: an elf is not
 * presented as an adult at fifteen merely because the UI uses three broad cohorts.
 */
function elderAgeForRace(maturity: number, lifespan: number): number {
  const humanAdultSpan = HUMAN_LIFESPAN - HUMAN_MATURITY_AGE;
  const raceAdultSpan = lifespan - maturity;
  return Math.round(maturity + ((HUMAN_ELDER_AGE - HUMAN_MATURITY_AGE) / humanAdultSpan) * raceAdultSpan);
}

/**
 * Resolves display-only cohort labels for a mono-racial polity.
 *
 * The underlying demographic buckets remain aggregate counts; a mixed polity deliberately
 * retains the neutral labels because there is no single race calendar that describes it.
 */
export function getPopulationAgeBands(
  races: readonly Race[] | undefined,
  raceId: number | undefined,
  isMonoRacial: boolean
): PopulationAgeBands {
  if (!isMonoRacial || raceId === undefined) return DEFAULT_POPULATION_AGE_BANDS;

  const maturity = Math.round(getRaceFertility(races, raceId).fertilityStart);
  const lifespan = Math.round(getRaceLifespan(races, raceId));

  // Preserve the long-standing labels for ordinary human settlements and fall back safely
  // for incomplete custom race definitions.
  if (maturity === HUMAN_MATURITY_AGE && lifespan === HUMAN_LIFESPAN) return DEFAULT_POPULATION_AGE_BANDS;
  if (maturity < 1 || lifespan <= maturity + 1) return DEFAULT_POPULATION_AGE_BANDS;

  const elderAge = elderAgeForRace(maturity, lifespan);
  if (elderAge <= maturity) return DEFAULT_POPULATION_AGE_BANDS;

  return {
    elders: `${elderAge}+`,
    adults: `${maturity}-${elderAge - 1}`,
    children: `0-${maturity - 1}`
  };
}
