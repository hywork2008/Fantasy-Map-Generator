/**
 * Rough polity age from present population + race fertility.
 *
 * Assumption (user-facing lore tool, not a full demography sim):
 * the realm grew from a founding cohort of **fertile couples** under average
 * lifetime births (R_max), with generation length ≈ mean age in the fertile window.
 *
 *   λ = R_max / 2          (next-generation size factor; half female, full survival)
 *   n = ln(N / N0) / ln(λ)  (generations)
 *   years ≈ n × T           (T = mean maternal age)
 *
 * Near-replacement races (λ≈1) cannot explain large N by births alone — report that.
 */
import type { Race, RaceFertility } from "../types/models";
import { DEFAULT_RACE_FERTILITY, DEFAULT_RACE_LIFESPAN, getRaceById, getRaceFertility, getRaceLifespan } from "./races";

/** Default founding cohort: 50 couples of reproductive age. */
export const FOUNDING_COUPLES_DEFAULT = 50;

export interface PolityAgeEstimate {
  /** Estimated years since founding; null if growth model cannot explain the population. */
  years: number | null;
  /** Generations of growth (null when years is null). */
  generations: number | null;
  /** Founding population N0 = couples × 2. */
  foundingPopulation: number;
  /** Present population used in the estimate. */
  population: number;
  /** Lifetime births per female (R_max). */
  rMax: number;
  /** Growth factor per generation (λ = R_max/2). */
  growthFactor: number;
  /** Generation length in years (mean age in fertile window). */
  generationYears: number;
  /** Race display name if known. */
  raceName: string;
  /** Short English status for UI. */
  status: "ok" | "too_small" | "near_replacement" | "invalid";
  /** One-line explanation. */
  note: string;
}

/** Catalog R_max = (end−start)/interbirth × litterMean. */
export function rMaxFromFertility(fertility: RaceFertility): number {
  const window = Math.max(0, fertility.fertilityEnd - fertility.fertilityStart);
  if (window <= 0) return 0;
  return (window / Math.max(0.5, fertility.interbirthYears)) * fertility.litterMean;
}

/**
 * Mean age of childbearing ≈ midpoint of the fertile window,
 * capped so it does not exceed a large fraction of typical lifespan.
 */
export function generationLengthYears(fertility: RaceFertility, lifespan?: number): number {
  const mid = (fertility.fertilityStart + fertility.fertilityEnd) / 2;
  if (lifespan !== undefined && lifespan > 0) {
    return Math.max(fertility.fertilityStart, Math.min(mid, lifespan * 0.55));
  }
  return Math.max(1, mid);
}

/** λ = next generation / this generation under full survival of offspring. */
export function growthFactorPerGeneration(rMax: number): number {
  return Math.max(0, rMax / 2);
}

/**
 * Reverse exponential growth from founding couples to current population.
 */
export function estimatePolityAgeFromPopulation(
  population: number,
  fertility: RaceFertility,
  options?: {
    lifespan?: number;
    foundingCouples?: number;
    raceName?: string;
  }
): PolityAgeEstimate {
  const couples = options?.foundingCouples ?? FOUNDING_COUPLES_DEFAULT;
  const foundingPopulation = Math.max(2, couples * 2);
  const raceName = options?.raceName ?? "Unknown";
  const rMax = rMaxFromFertility(fertility);
  const growthFactor = growthFactorPerGeneration(rMax);
  const generationYears = generationLengthYears(fertility, options?.lifespan);

  const base = {
    foundingPopulation,
    population: Math.max(0, population),
    rMax,
    growthFactor,
    generationYears,
    raceName
  };

  if (!Number.isFinite(population) || population <= 0) {
    return {
      ...base,
      years: null,
      generations: null,
      status: "invalid",
      note: "No population to estimate from."
    };
  }

  if (population <= foundingPopulation) {
    return {
      ...base,
      years: 0,
      generations: 0,
      status: "too_small",
      note: `Population ≤ founding cohort (${foundingPopulation} from ${couples} couples) — treated as recent founding.`
    };
  }

  // Near replacement: pure birth growth cannot produce large realms.
  if (growthFactor <= 1.001) {
    return {
      ...base,
      years: null,
      generations: null,
      status: "near_replacement",
      note: `R_max ≈ ${rMax.toFixed(2)} (λ≈${growthFactor.toFixed(2)}) is near replacement — birth growth alone cannot explain expansion from ${couples} couples.`
    };
  }

  const generations = Math.log(population / foundingPopulation) / Math.log(growthFactor);
  const years = generations * generationYears;

  if (!Number.isFinite(years) || years < 0) {
    return {
      ...base,
      years: null,
      generations: null,
      status: "invalid",
      note: "Could not compute a finite age."
    };
  }

  return {
    ...base,
    years: Math.round(years),
    generations: Math.round(generations * 10) / 10,
    status: "ok",
    note: `From ${couples} fertile couples (N₀=${foundingPopulation}), R_max≈${rMax.toFixed(2)}, T≈${Math.round(generationYears)} y/gen.`
  };
}

/**
 * Estimate using pack races + culture race id (or human defaults).
 */
export function estimatePolityAgeForRace(
  population: number,
  races: readonly Race[] | undefined,
  raceId: number | undefined,
  foundingCouples: number = FOUNDING_COUPLES_DEFAULT
): PolityAgeEstimate {
  const fertility = getRaceFertility(races, raceId);
  const race = getRaceById(races, raceId);
  const lifespan = getRaceLifespan(races, raceId) || race?.lifespan || DEFAULT_RACE_LIFESPAN;
  return estimatePolityAgeFromPopulation(population, fertility ?? DEFAULT_RACE_FERTILITY, {
    lifespan,
    foundingCouples,
    raceName: race?.name ?? "Human"
  });
}

/** Format years for UI (e.g. 7200 → "≈ 7.2K years"). */
export function formatPolityAgeYears(years: number | null): string {
  if (years === null || !Number.isFinite(years)) return "—";
  if (years < 1) return "< 1 year";
  if (years < 1000) return `≈ ${Math.round(years)} years`;
  if (years < 10000) return `≈ ${(years / 1000).toFixed(1)}K years`;
  return `≈ ${Math.round(years / 1000)}K years`;
}
