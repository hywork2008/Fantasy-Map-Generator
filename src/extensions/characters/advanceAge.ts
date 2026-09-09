import { getRaceById } from "../hostRaces";
import { P, rand } from "../hostUtils";
import {
  LOOKS_SOFT_DECLINE_PER_YEAR,
  LOOKS_VITALITY_DECLINE_PER_YEAR,
  ownRaceAppearanceScore,
  resolveCharacterRaceId
} from "./appearance";
import { diseaseDeathReason, diseaseDeathRiskFor } from "./characterHealth";
import {
  getCharacters,
  getCurrentYear,
  getPersonalTechnologyKnowledge,
  getWorldContext,
  hasCharactersContext,
  replaceCharacters,
  setPersonalTechnologyKnowledge
} from "./charactersContext";
import {
  type Character,
  type CharacterRoleClass,
  type CharacterSkills,
  isCk3Character,
  type RaisedIn
} from "./characterTypes";
import { getRaceMaturityAge, resolveRaceAgeProfile, scaleHumanAgeToRace } from "./raceAge";

/**
 * Slack allowed when deciding whether the age accumulator has crossed a whole year: half a day.
 *
 * Elapsed time reaches this function as `days / 365.2425` (the mean Gregorian year every
 * delta-driven system uses), but the calendar advances in whole days, so a span of N calendar
 * years lands a fraction of a day *short* of N whenever it contains fewer leap days than the
 * 0.2425 average — measured at 0.9991 after 50 years. Without this the UI would say five years
 * passed while a character aged four, until the next tick nudged it over. Half a day cannot cause
 * a spurious extra year: the smallest real step is a full day (0.0027 years).
 */
const AGE_YEAR_EPSILON = 0.5 / 365.2425;

/** Physical decline sets in past this age for short-lived (human-scale) races only. */
export const DECLINE_AGE_THRESHOLD = 35;
/** Legacy scalar appearance decline (characters without `looks` axes). Matches vitality axis rate. */
export const APPEARANCE_DECLINE_PER_YEAR = LOOKS_VITALITY_DECLINE_PER_YEAR;
/**
 * Prowess aging: warriors keep form, laborers slow, indoor clerks fade.
 * Human 60-year-old career soldier at peak 90 still sits near 80 — old generals can fight.
 */
export type ProwessLifestyle = "warrior" | "labor" | "indoor";

/** Indoor / clerical personal combat decline after peak age. */
export const PROWESS_DECLINE_PER_YEAR_INDOOR = 2;
/** Farm, craft, and other bodily work — slower than a desk career, faster than drill. */
export const PROWESS_DECLINE_PER_YEAR_LABOR = 1;
/** Daily arms practice. ~0.4/year from 35 → −10 by 60, −14 by 70. */
export const PROWESS_DECLINE_PER_YEAR_WARRIOR = 0.4;
/** @deprecated Use PROWESS_DECLINE_PER_YEAR_INDOOR. */
export const PROWESS_DECLINE_PER_YEAR = PROWESS_DECLINE_PER_YEAR_INDOOR;
/** @deprecated Use PROWESS_DECLINE_PER_YEAR_WARRIOR. */
export const PROWESS_DECLINE_PER_YEAR_MILITARY = PROWESS_DECLINE_PER_YEAR_WARRIOR;

/**
 * Races with typical lifespan at or above this skip human-scale age decline
 * (prowess / looks). Elves, dwarves, giants, draconic, etc.
 */
export const LONG_LIVED_LIFESPAN_MIN = 150;

/** True when this race should not take human mid-life physical age penalties. */
export function raceIgnoresAgeDecline(lifespan: number | undefined | null): boolean {
  return (lifespan ?? 75) >= LONG_LIVED_LIFESPAN_MIN;
}

export function characterIgnoresAgeDecline(character: Pick<Character, "race" | "culture">): boolean {
  if (!hasCharactersContext()) return false;
  try {
    const raceId = resolveCharacterRaceId(character);
    const race = getRaceById(getWorldContext().pack.races, raceId);
    return raceIgnoresAgeDecline(race?.lifespan);
  } catch {
    return false;
  }
}

/** Active military title patterns (field + court war offices). */
const MILITARY_TITLE_RE = /Commander|Admiral|Marshal|General|Warlord|Minister of War|Shogun/i;
/** Economy / extension roles that are professional fighters rather than desk careers. */
const MILITARY_ROLE_KIND_RE = /bodyguard|soldier|guard|regiment|garrison/i;
/** Craft and haul work — smiths, apprentices, miners, sailors, farmhands. */
const LABOR_ROLE_KIND_RE =
  /guildMaster|guildApprentice|blacksmith|smelt|miner|mason|carpenter|farmer|herder|sailor|fisher|labour|labor/i;
const LABOR_RAISED_IN = new Set<RaisedIn>(["rural_manor", "frontier_burg", "street", "military_camp"]);

const PROWESS_DECLINE_RATE: Record<ProwessLifestyle, number> = {
  warrior: PROWESS_DECLINE_PER_YEAR_WARRIOR,
  labor: PROWESS_DECLINE_PER_YEAR_LABOR,
  indoor: PROWESS_DECLINE_PER_YEAR_INDOOR
};

/**
 * True for characters whose living is fighting or command.
 * Uses current titles/roles only (retired officers lose the warrior rate when they stop drilling).
 */
export function isMilitaryCareerCharacter(character: Pick<Character, "titles" | "roles">): boolean {
  if (character.titles.some(t => MILITARY_TITLE_RE.test(t.title))) return true;
  if (character.roles?.some(r => MILITARY_ROLE_KIND_RE.test(r.kind))) return true;
  return false;
}

function isPhysicalLaborCharacter(character: Pick<Character, "titles" | "roles" | "backstory">): boolean {
  if (character.roles?.some(r => LABOR_ROLE_KIND_RE.test(r.kind))) return true;
  const occupation = character.backstory?.origin.familyOccupation;
  if (occupation === "agriculture" || occupation === "craft") return true;
  const raisedIn = character.backstory?.origin.raisedIn;
  return raisedIn !== undefined && LABOR_RAISED_IN.has(raisedIn);
}

/**
 * How this person uses their body day to day. Warrior > labor > indoor for keeping prowess.
 */
export function prowessLifestyleForCharacter(
  character: Pick<Character, "titles" | "roles" | "backstory">
): ProwessLifestyle {
  if (isMilitaryCareerCharacter(character)) return "warrior";
  if (isPhysicalLaborCharacter(character)) return "labor";
  return "indoor";
}

export function prowessLifestyleForCreation(
  roleClass?: CharacterRoleClass,
  primarySkill?: keyof CharacterSkills
): ProwessLifestyle {
  if (roleClass === "commander") return "warrior";
  if (primarySkill === "martial" || primarySkill === "prowess") return "warrior";
  if (roleClass === "province_lord") return "labor";
  if (primarySkill === "engineering") return "labor";
  return "indoor";
}

/** Per-year prowess decline rate for a living character. */
export function prowessDeclineRateForCharacter(character: Pick<Character, "titles" | "roles" | "backstory">): number {
  return PROWESS_DECLINE_RATE[prowessLifestyleForCharacter(character)];
}

/** Generation-time rate before titles exist. */
export function prowessDeclineRateForCreation(
  roleClass?: CharacterRoleClass,
  primarySkill?: keyof CharacterSkills
): number {
  return PROWESS_DECLINE_RATE[prowessLifestyleForCreation(roleClass, primarySkill)];
}

/**
 * Total decline accrued by `age` under the generation-time formula (0 below the threshold).
 * Pass `skipDecline: true` for long-lived races (no human-scale age penalty).
 */
export function declineAt(age: number, ratePerYear: number, skipDecline = false): number {
  if (skipDecline) return 0;
  return age > DECLINE_AGE_THRESHOLD ? Math.floor((age - DECLINE_AGE_THRESHOLD) * ratePerYear) : 0;
}

/**
 * Generic per-tick aging pass: age increment, appearance/prowess decline, mortality roll, and
 * (for characters who die) moving their titles to pastTitles. Deliberately holds no title-table
 * or office knowledge — political consequences of death/aging (resignation, succession, retired-
 * character effects) are handled by Nobility's processResignationsAndSuccessions(), which must
 * run immediately after this pass so a character who dies this tick is already reflected before
 * political logic runs (see docs/plan/char-economy.md for the two-pass split rationale).
 */
export function advanceCharacterAging(deltaYears: number): void {
  if (deltaYears <= 0) return;
  const characters = getCharacters();
  if (!characters.length) return;

  for (const character of characters) {
    if (character.dead) continue;
    const usesCk3Systems = isCk3Character(character);

    const oldAge = character.age;
    // Sub-year remainders are carried on the character (docs/plan/advance-time-history-mode.md
    // §0): this runs once per simulated day with deltaYears ~ 1/365, and rounding the sum to an
    // integer every call left `age` frozen at its generated value forever. Accumulating the
    // remainder makes 365 daily calls and one single-year call agree exactly.
    const accumulated = (character.ageFraction ?? 0) + deltaYears;
    const wholeYears = Math.floor(accumulated + AGE_YEAR_EPSILON);
    const newAge = oldAge + wholeYears;
    const skipAgePenalty = characterIgnoresAgeDecline(character);

    const appearanceDecline =
      declineAt(newAge, LOOKS_VITALITY_DECLINE_PER_YEAR, skipAgePenalty) -
      declineAt(oldAge, LOOKS_VITALITY_DECLINE_PER_YEAR, skipAgePenalty);
    // Mild soft-feature loss on symmetry/refinement after peak age.
    const softDecline =
      declineAt(newAge, LOOKS_SOFT_DECLINE_PER_YEAR, skipAgePenalty) -
      declineAt(oldAge, LOOKS_SOFT_DECLINE_PER_YEAR, skipAgePenalty);
    const prowessRate = prowessDeclineRateForCharacter(character);
    const prowessDecline =
      declineAt(newAge, prowessRate, skipAgePenalty) - declineAt(oldAge, prowessRate, skipAgePenalty);

    character.age = newAge;
    character.ageFraction = accumulated - wholeYears;
    if (appearanceDecline > 0) {
      // Prefer axis decline (vitality) + own-race Appearance cache when looks exist.
      if (character.looks) {
        character.looks.vitality = Math.max(1, character.looks.vitality - appearanceDecline);
        if (softDecline > 0) {
          character.looks.symmetry = Math.max(1, character.looks.symmetry - softDecline);
          character.looks.refinement = Math.max(1, character.looks.refinement - softDecline);
        }
        const races = hasCharactersContext() ? getWorldContext().pack.races : undefined;
        character.appearance = ownRaceAppearanceScore(character.looks, resolveCharacterRaceId(character), races);
      } else {
        character.appearance = Math.max(1, character.appearance - appearanceDecline);
      }
    }
    if (usesCk3Systems && prowessDecline > 0) {
      character.skills.prowess = Math.max(1, character.skills.prowess - prowessDecline);
      if (character.abilityProfile?.presetId === "ck3e") {
        character.abilityProfile.values.prowess = character.skills.prowess;
      }
    }

    // Mortality: human-scale curve for short-lived races only.
    // Long-lived folk do not take the "past 50" spike (no human mid-life age penalty).
    const baseMortalityRisk = skipAgePenalty ? 0.002 : 0.01 + (newAge > 50 ? 1.15 ** (newAge - 50) / 100 : 0);
    // Sickness (see characterHealth.ts) adds to, never replaces, the age curve above — a
    // character with no active affliction contributes 0 here, so this is purely additive.
    const mortalityRisk = Math.min(0.99, baseMortalityRisk + diseaseDeathRiskFor(character));
    const survivalProb = (1 - mortalityRisk) ** deltaYears;
    if (Math.random() > survivalProb) {
      character.dead = true;
      character.deathYear = getCurrentYear();
      const knowledge = { ...getPersonalTechnologyKnowledge() };
      delete knowledge[String(character.i)];
      setPersonalTechnologyKnowledge(knowledge);

      let baseReason = diseaseDeathReason(character) ?? "Deceased";
      if (usesCk3Systems && character.titles.length > 0) {
        if (character.personality.sociability < 30 && P(0.005 * deltaYears)) {
          baseReason = "Assassinated";
        } else if (character.personality.boldness > 80 && P(0.005 * deltaYears)) {
          baseReason = "Slain in battle";
        }
      }

      for (const t of character.titles) {
        t.endYear = getCurrentYear();
        t.reason = baseReason;
        character.pastTitles.push(t);
      }
      character.titles = [];
      continue;
    }

    // Age growth for young characters (thresholds scale with race maturity).
    const raceId = resolveCharacterRaceId(character);
    const profile = resolveRaceAgeProfile(raceId);
    const maturity = getRaceMaturityAge(raceId);
    const youngAdultCap = scaleHumanAgeToRace(25, profile);
    // Growth is driven by whole elapsed years, not the raw delta: at the daily cadence
    // `Math.floor(growthMax * 1/365)` was always 0, so young characters never grew either (§0.2).
    // Skipping the block entirely on the ~364 days that complete no year also saves the rand()
    // draws it used to burn per character per day.
    if (usesCk3Systems && newAge <= youngAdultCap && wholeYears > 0) {
      const growthMax = newAge <= maturity ? rand(3, 8) : rand(0, 2);
      const growth = Math.floor(growthMax * wholeYears);
      if (growth > 0) {
        for (const key of Object.keys(character.skills) as (keyof typeof character.skills)[]) {
          if (character.skills[key] < 100 && P(0.5)) {
            character.skills[key] = Math.min(100, character.skills[key] + growth);
          }
        }
        // Also grow confidence slightly
        if (character.personality.confidence < 100 && P(0.5)) {
          character.personality.confidence = Math.min(100, character.personality.confidence + growth);
        }
      }

      // Personality drift for children (personalities become more extreme/defined as they grow)
      if (newAge <= maturity) {
        const drift = Math.floor(rand(1, 4) * wholeYears);
        for (const key of Object.keys(character.personality) as (keyof typeof character.personality)[]) {
          if (key === "confidence") continue; // Handled above
          let val = (character.personality as unknown as Record<string, number>)[key as string];
          if (val > 50 && val < 100) {
            val = Math.min(100, val + drift);
          } else if (val <= 50 && val > 1) {
            val = Math.max(1, val - drift);
          }
          (character.personality as unknown as Record<string, number>)[key as string] = val;
        }
      }
    }
  }
}

export function clearCharacters(): void {
  replaceCharacters([]);
}
