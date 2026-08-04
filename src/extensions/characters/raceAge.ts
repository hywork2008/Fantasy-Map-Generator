/**
 * Race-relative calendar ages for named characters.
 *
 * Office / adult age bands are authored in **human years**, then mapped onto each
 * race's maturity (`fertilityStart`) and typical `lifespan` so long-lived folk are
 * not stuck as chronological children when rolled with human 28–65 ranges.
 *
 * Spec intent: population-sim + fantasy maturity (elf ~100, dwarf ~40, …).
 */
import {
  DEFAULT_RACE_FERTILITY,
  DEFAULT_RACE_LIFESPAN,
  getRaceById,
  getRaceFertility,
  getRaceLifespan
} from "../../data/races";
import { rand } from "../hostUtils";
import { getWorldContext, hasCharactersContext } from "./charactersContext";

/** Human reference used when authoring role age bands. */
export const REFERENCE_HUMAN_LIFESPAN = 75;
/** Human legal / social adulthood used as the juvenile→adult hinge. */
export const REFERENCE_HUMAN_MATURITY = 16;

/**
 * Court / named-character sex ratio from reproductive time-budget.
 * Short-lived folk (high fraction of life in pregnancy & childrearing) keep a feudal
 * male office bias; long-lived folk approach parity with a slight female majority
 * (males more often die as protectors). Used when race has no explicit characterGender.
 */
export const FEUDAL_MALE_SHARE = 0.9;
/** Male share once lifespan ≥ GENDER_EQUALITY_LIFESPAN_FULL (slightly female-leaning). */
export const LONG_LIVED_MALE_SHARE = 0.45;
/** Lifespan at which feudal male bias still fully applies. */
export const GENDER_EQUALITY_LIFESPAN_START = REFERENCE_HUMAN_LIFESPAN;
/** Lifespan at which LONG_LIVED_MALE_SHARE is fully reached. */
export const GENDER_EQUALITY_LIFESPAN_FULL = 500;

/** Default officeholder band in human years (createPerson without ageOverride). */
export const HUMAN_DEFAULT_ADULT_MIN = 28;
export const HUMAN_DEFAULT_ADULT_MAX = 65;

/** Field / fleet officers. */
export const HUMAN_OFFICER_MIN = 22;
export const HUMAN_OFFICER_MAX = 60;

/** Landed rulers / province lords. */
export const HUMAN_RULER_MIN = 28;
export const HUMAN_RULER_MAX = 65;

/** Elected / appointed non-hereditary adults. */
export const HUMAN_ELECTED_MIN = 35;
export const HUMAN_ELECTED_MAX = 75;

/** Hereditary adult relative when a child ruler dies. */
export const HUMAN_HEIR_ADULT_MIN = 16;
export const HUMAN_HEIR_ADULT_MAX = 50;

/** Guild apprentices (pre- or early-maturity). */
export const HUMAN_APPRENTICE_MIN = 12;
export const HUMAN_APPRENTICE_MAX = 17;

/** Typical human parent→child age gap used for hereditary heirs. */
export const HUMAN_PARENT_CHILD_GAP_MIN = 15;
export const HUMAN_PARENT_CHILD_GAP_MAX = 45;

/** Minimum human gap to treat heir as direct child of previous ruler. */
export const HUMAN_DIRECT_CHILD_GAP = 14;

/** Human age used when estimating how long someone has held an office. */
export const HUMAN_CAREER_START = 20;

export interface RaceAgeProfile {
  maturity: number;
  lifespan: number;
}

/**
 * Resolve maturity (fertility start) and typical lifespan for a pack.races id.
 * Safe without characters context (catalog / human defaults).
 */
export function resolveRaceAgeProfile(raceId: number | undefined): RaceAgeProfile {
  if (raceId === undefined) {
    return {
      maturity: DEFAULT_RACE_FERTILITY.fertilityStart,
      lifespan: DEFAULT_RACE_LIFESPAN
    };
  }
  if (!hasCharactersContext()) {
    return {
      maturity: DEFAULT_RACE_FERTILITY.fertilityStart,
      lifespan: DEFAULT_RACE_LIFESPAN
    };
  }
  try {
    const races = getWorldContext().pack.races;
    const fertility = getRaceFertility(races, raceId);
    let lifespan = getRaceLifespan(races, raceId);
    const race = getRaceById(races, raceId);
    if (race?.maxLifespan !== undefined && race.maxLifespan > lifespan) {
      // Soft upper for rolls: typical life, not the rare extreme.
      lifespan = race.lifespan ?? lifespan;
    }
    const maturity = Math.max(1, fertility.fertilityStart);
    // Ensure adult span is positive even if catalog is odd.
    if (lifespan <= maturity + 5) {
      lifespan = maturity + Math.max(20, DEFAULT_RACE_LIFESPAN - DEFAULT_RACE_FERTILITY.fertilityStart);
    }
    return { maturity, lifespan };
  } catch {
    return {
      maturity: DEFAULT_RACE_FERTILITY.fertilityStart,
      lifespan: DEFAULT_RACE_LIFESPAN
    };
  }
}

export function getRaceMaturityAge(raceId: number | undefined): number {
  return resolveRaceAgeProfile(raceId).maturity;
}

/**
 * P(male) for random officeholders when the race does not set characterGender.
 * Interpolates FEUDAL_MALE_SHARE → LONG_LIVED_MALE_SHARE by typical lifespan.
 */
export function maleShareForLifespan(lifespan: number): number {
  const life = Math.max(1, lifespan);
  if (life <= GENDER_EQUALITY_LIFESPAN_START) return FEUDAL_MALE_SHARE;
  if (life >= GENDER_EQUALITY_LIFESPAN_FULL) return LONG_LIVED_MALE_SHARE;
  const t = (life - GENDER_EQUALITY_LIFESPAN_START) / (GENDER_EQUALITY_LIFESPAN_FULL - GENDER_EQUALITY_LIFESPAN_START);
  return FEUDAL_MALE_SHARE + t * (LONG_LIVED_MALE_SHARE - FEUDAL_MALE_SHARE);
}

/** Resolve default male share for a pack.races id (lifespan-based). */
export function maleShareForRace(raceId: number | undefined): number {
  return maleShareForLifespan(resolveRaceAgeProfile(raceId).lifespan);
}

/**
 * Map a single human-calendar age onto race years.
 * - Ages ≤ human maturity scale 0…maturity.
 * - Ages above maturity scale maturity…lifespan (human 75 ≈ typical lifespan).
 */
export function scaleHumanAgeToRace(
  humanAge: number,
  profile: RaceAgeProfile,
  humanMaturity = REFERENCE_HUMAN_MATURITY,
  humanLifespan = REFERENCE_HUMAN_LIFESPAN
): number {
  const { maturity, lifespan } = profile;
  if (humanAge <= 0) return 0;
  if (humanAge <= humanMaturity) {
    return Math.max(0, Math.round((humanAge / humanMaturity) * maturity));
  }
  const adultHuman = Math.max(1, humanLifespan - humanMaturity);
  const adultRace = Math.max(1, lifespan - maturity);
  const t = (humanAge - humanMaturity) / adultHuman;
  return Math.round(maturity + t * adultRace);
}

/**
 * Scale a human *duration* (gap, tenure) by adult-year ratio.
 * 1 human adult year ≈ (lifespan − maturity) / (75 − 16) race years.
 */
export function scaleHumanDurationToRace(
  humanYears: number,
  profile: RaceAgeProfile,
  humanMaturity = REFERENCE_HUMAN_MATURITY,
  humanLifespan = REFERENCE_HUMAN_LIFESPAN
): number {
  const adultHuman = Math.max(1, humanLifespan - humanMaturity);
  const adultRace = Math.max(1, profile.lifespan - profile.maturity);
  return Math.max(0, Math.round(humanYears * (adultRace / adultHuman)));
}

/** Inclusive random age in a human band, scaled to the race. */
export function rollRaceAgeFromHumanBand(raceId: number | undefined, humanMin: number, humanMax: number): number {
  const profile = resolveRaceAgeProfile(raceId);
  const lo = scaleHumanAgeToRace(Math.min(humanMin, humanMax), profile);
  const hi = scaleHumanAgeToRace(Math.max(humanMin, humanMax), profile);
  return rand(lo, Math.max(lo, hi));
}

export function rollDefaultAdultAge(raceId: number | undefined): number {
  return rollRaceAgeFromHumanBand(raceId, HUMAN_DEFAULT_ADULT_MIN, HUMAN_DEFAULT_ADULT_MAX);
}

export function rollOfficerAge(raceId: number | undefined): number {
  return rollRaceAgeFromHumanBand(raceId, HUMAN_OFFICER_MIN, HUMAN_OFFICER_MAX);
}

export function rollRulerAge(raceId: number | undefined): number {
  return rollRaceAgeFromHumanBand(raceId, HUMAN_RULER_MIN, HUMAN_RULER_MAX);
}

export function rollElectedAdultAge(raceId: number | undefined): number {
  return rollRaceAgeFromHumanBand(raceId, HUMAN_ELECTED_MIN, HUMAN_ELECTED_MAX);
}

export function rollApprenticeAge(raceId: number | undefined): number {
  return rollRaceAgeFromHumanBand(raceId, HUMAN_APPRENTICE_MIN, HUMAN_APPRENTICE_MAX);
}

/**
 * Hereditary heir age given the previous ruler (or adult relative when ruler was a child).
 */
export function rollHereditaryHeirAge(raceId: number | undefined, previousRulerAge: number): number {
  const profile = resolveRaceAgeProfile(raceId);
  if (previousRulerAge < profile.maturity) {
    return rollRaceAgeFromHumanBand(raceId, HUMAN_HEIR_ADULT_MIN, HUMAN_HEIR_ADULT_MAX);
  }
  const gapMin = scaleHumanDurationToRace(HUMAN_PARENT_CHILD_GAP_MIN, profile);
  const gapMax = scaleHumanDurationToRace(HUMAN_PARENT_CHILD_GAP_MAX, profile);
  return Math.max(0, previousRulerAge - rand(gapMin, Math.max(gapMin, gapMax)));
}

/** Min age gap so heir is treated as a direct child of the previous ruler. */
export function directChildAgeGap(raceId: number | undefined): number {
  return scaleHumanDurationToRace(HUMAN_DIRECT_CHILD_GAP, resolveRaceAgeProfile(raceId));
}

/**
 * Earliest plausible office-holding age (human ~20), for title startYear backfill.
 */
export function careerStartAge(raceId: number | undefined): number {
  return scaleHumanAgeToRace(HUMAN_CAREER_START, resolveRaceAgeProfile(raceId));
}

/** True when chronological age is below race maturity (regency / child stats). */
export function isRaceMinor(age: number, raceId: number | undefined): boolean {
  return age < getRaceMaturityAge(raceId);
}

/**
 * Human late-marriage thresholds (21 / 25 / 28) mapped to race adult calendar.
 * Used by getUnmarriedChance so elves are not “established adults” at age 40.
 */
export function raceLateMarriageThresholds(raceId: number | undefined): {
  maturity: number;
  early: number;
  mid: number;
  established: number;
} {
  const profile = resolveRaceAgeProfile(raceId);
  return {
    maturity: profile.maturity,
    early: scaleHumanAgeToRace(21, profile),
    mid: scaleHumanAgeToRace(25, profile),
    established: scaleHumanAgeToRace(28, profile)
  };
}
