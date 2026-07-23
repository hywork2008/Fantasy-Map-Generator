import { P, rand } from "../hostUtils";
import { getCharacters, getCurrentYear, replaceCharacters } from "./charactersContext";

/** Physical decline sets in past this age — mirrors the generation-time formula in personFactory.ts's createPerson(). */
export const DECLINE_AGE_THRESHOLD = 35;
export const APPEARANCE_DECLINE_PER_YEAR = 1.5;
export const PROWESS_DECLINE_PER_YEAR = 2;

/** Total decline accrued by `age` under the generation-time formula (0 below the threshold). */
export function declineAt(age: number, ratePerYear: number): number {
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

    const appearanceDecline =
      declineAt(newAge, APPEARANCE_DECLINE_PER_YEAR) - declineAt(oldAge, APPEARANCE_DECLINE_PER_YEAR);
    const prowessDecline = declineAt(newAge, PROWESS_DECLINE_PER_YEAR) - declineAt(oldAge, PROWESS_DECLINE_PER_YEAR);

    character.age = newAge;
    if (appearanceDecline > 0) character.appearance = Math.max(1, character.appearance - appearanceDecline);
    if (prowessDecline > 0) character.skills.prowess = Math.max(1, character.skills.prowess - prowessDecline);

    // Mortality Check: Base risk 1% per year, increasing exponentially past 50.
    const mortalityRisk = 0.01 + (newAge > 50 ? 1.15 ** (newAge - 50) / 100 : 0);
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
