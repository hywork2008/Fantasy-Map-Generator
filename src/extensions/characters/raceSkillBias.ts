/**
 * Species-level skill medians and variance for named characters.
 *
 * Role / office / upbringing biases still stack on top (skillGeneration.ts).
 * Civic stance (diplomatic / distant / enemy colony): `src/data/raceCivicStance.ts`.
 *
 * Design notes:
 * - Long-lived folk: lower median Martial; wider skill σ for rare masters.
 * - Orcs: enemy colonies; Prowess high, Martial ≈ human (field experience).
 * - Draconic: top Prowess, weak Martial; pride depresses Diplomacy / Engineering.
 * - Giant (god-line): Prowess = draconic, Engineering = dwarf, Artistry mid-high;
 *   Learning slightly low (not mortal scholarship — not stupidity); Intrigue for
 *   non-involvement (controlled distance / intermediaries), not dark-elf court plots.
 * - Goblin / orc / arachnid: enemy-colony roster (martial mono courts only).
 */

import type { RaceKey } from "../../types/models";
import { ENEMY_COLONY_RACE_KEYS, isEnemyColonyRaceKey } from "../hostRaces";
import type { CharacterRoleClass, CharacterSkills } from "./characterTypes";
import { raceCatalog } from "./data/raceCatalog";

/** Additive mean shifts vs baseline skill median (same shape as skillGeneration SkillMeanTable). */
export type RaceSkillMeanTable = Partial<Record<keyof CharacterSkills, number>>;

/** Additive mean shifts vs SKILL_BASE_MEAN (before role / primary). */
export const RACE_SKILL_BIAS: Readonly<Record<string, RaceSkillMeanTable>> = Object.fromEntries(
  raceCatalog.map(def => [def.key, def.skillBias])
);

/**
 * Long-lived folk: same medians as the table, wider σ so rare masters show up
 * (centuries of practice) without lifting every courtier.
 */
export const LONG_LIVED_SKILL_STDDEV = 22;

/** Lifespan at which wider skill variance applies (matches episodic / mythic thresholds). */
export const LONG_LIVED_SKILL_VARIANCE_LIFESPAN_MIN = 150;

export function raceSkillBiasForKey(raceKey: RaceKey | string | undefined | null): RaceSkillMeanTable {
  if (!raceKey) return {};
  return RACE_SKILL_BIAS[raceKey] ?? {};
}

/** Human-scale skill σ (mirrors skillGeneration.SKILL_STDDEV — keep in sync). */
const SHORT_LIVED_SKILL_STDDEV = 16;

export function skillStddevForRace(lifespan: number | undefined | null): number {
  if ((lifespan ?? 75) >= LONG_LIVED_SKILL_VARIANCE_LIFESPAN_MIN) return LONG_LIVED_SKILL_STDDEV;
  return SHORT_LIVED_SKILL_STDDEV;
}

/**
 * Enemy-colony races: goblin, orc, arachnid.
 * Alias of civic stance for character-roster filters (no mixed court / merchants).
 */
export const ENEMY_DEDICATED_RACE_KEYS: ReadonlySet<string> = ENEMY_COLONY_RACE_KEYS;

export function isEnemyDedicatedRaceKey(raceKey: string | undefined | null): boolean {
  return isEnemyColonyRaceKey(raceKey);
}

/**
 * Roles allowed for enemy-colony races: warband / nest leaders and war command.
 * Peaceful desks (merchant, religious, most central officers) are excluded.
 */
export function isEnemyDedicatedRole(
  roleClass: CharacterRoleClass | undefined,
  primarySkill?: keyof CharacterSkills | string
): boolean {
  if (roleClass === "ruler" || roleClass === "commander" || roleClass === "province_lord") return true;
  if (roleClass === "central_officer" && primarySkill === "martial") return true;
  return false;
}

/** Keep only martial-primary offices for enemy-colony mono courts. */
export function filterOfficesForEnemyRace<T extends { primarySkill?: string }>(offices: readonly T[]): T[] {
  return offices.filter(o => o.primarySkill === "martial");
}
