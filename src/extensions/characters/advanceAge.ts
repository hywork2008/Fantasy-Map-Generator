import { getRaceById } from "../../data/races";
import { P, rand } from "../hostUtils";
import { ownRaceAppearanceScore, resolveCharacterRaceId } from "./appearance";
import {
  getCharacters,
  getCurrentYear,
  getWorldContext,
  hasCharactersContext,
  replaceCharacters
} from "./charactersContext";
import type { Character, CharacterRoleClass, CharacterSkills } from "./characterTypes";

/** Physical decline sets in past this age for short-lived (human-scale) races only. */
export const DECLINE_AGE_THRESHOLD = 35;
export const APPEARANCE_DECLINE_PER_YEAR = 1.5;
/** Civilian / non-military personal combat decline after peak age. */
export const PROWESS_DECLINE_PER_YEAR = 2;
/**
 * Career soldiers keep form longer: half the civilian rate.
 * Applied to commanders, martial offices, bodyguards, etc.
 */
export const PROWESS_DECLINE_PER_YEAR_MILITARY = 1;

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
const MILITARY_TITLE_RE = /Commander|Admiral|Marshal|General|Warlord|Minister of War/i;
/** Economy / extension roles that are professional fighters rather than desk careers. */
const MILITARY_ROLE_KIND_RE = /bodyguard|soldier|guard|regiment|garrison/i;

/**
 * True for characters whose living is fighting or command — they age slower in prowess.
 * Uses current titles/roles only (retired officers use the civilian rate).
 */
export function isMilitaryCareerCharacter(character: Pick<Character, "titles" | "roles">): boolean {
  if (character.titles.some(t => MILITARY_TITLE_RE.test(t.title))) return true;
  if (character.roles?.some(r => MILITARY_ROLE_KIND_RE.test(r.kind))) return true;
  return false;
}

/** Per-year prowess decline rate for a living character (military ≈ half of civilian). */
export function prowessDeclineRateForCharacter(character: Pick<Character, "titles" | "roles">): number {
  return isMilitaryCareerCharacter(character) ? PROWESS_DECLINE_PER_YEAR_MILITARY : PROWESS_DECLINE_PER_YEAR;
}

/**
 * Generation-time rate before titles exist: commander / martial-primary careers use the military rate.
 */
export function prowessDeclineRateForCreation(
  roleClass?: CharacterRoleClass,
  primarySkill?: keyof CharacterSkills
): number {
  if (roleClass === "commander") return PROWESS_DECLINE_PER_YEAR_MILITARY;
  if (primarySkill === "martial" || primarySkill === "prowess") return PROWESS_DECLINE_PER_YEAR_MILITARY;
  return PROWESS_DECLINE_PER_YEAR;
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

    const oldAge = character.age;
    const newAge = Math.round(oldAge + deltaYears);
    const skipAgePenalty = characterIgnoresAgeDecline(character);

    const appearanceDecline =
      declineAt(newAge, APPEARANCE_DECLINE_PER_YEAR, skipAgePenalty) -
      declineAt(oldAge, APPEARANCE_DECLINE_PER_YEAR, skipAgePenalty);
    // Mild soft-feature loss (~1/3 of vitality decline rate), only when aging past the threshold.
    const softDecline =
      declineAt(newAge, APPEARANCE_DECLINE_PER_YEAR * 0.35, skipAgePenalty) -
      declineAt(oldAge, APPEARANCE_DECLINE_PER_YEAR * 0.35, skipAgePenalty);
    const prowessRate = prowessDeclineRateForCharacter(character);
    const prowessDecline =
      declineAt(newAge, prowessRate, skipAgePenalty) - declineAt(oldAge, prowessRate, skipAgePenalty);

    character.age = newAge;
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
    if (prowessDecline > 0) {
      character.skills.prowess = Math.max(1, character.skills.prowess - prowessDecline);
      if (character.abilityProfile?.presetId === "ck3e") {
        character.abilityProfile.values.prowess = character.skills.prowess;
      }
    }

    // Mortality: human-scale curve for short-lived races only.
    // Long-lived folk do not take the "past 50" spike (no human mid-life age penalty).
    const mortalityRisk = skipAgePenalty ? 0.002 : 0.01 + (newAge > 50 ? 1.15 ** (newAge - 50) / 100 : 0);
    const survivalProb = (1 - Math.min(0.99, mortalityRisk)) ** deltaYears;
    if (Math.random() > survivalProb) {
      character.dead = true;
      character.deathYear = getCurrentYear();

      let baseReason = "Deceased";
      if (character.titles.length > 0) {
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

    // Age Growth for young characters
    if (newAge <= 25 && deltaYears > 0) {
      const growthMax = newAge <= 16 ? rand(3, 8) : rand(0, 2);
      const growth = Math.floor(growthMax * deltaYears);
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
      if (newAge <= 16) {
        const drift = Math.floor(rand(1, 4) * deltaYears);
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
