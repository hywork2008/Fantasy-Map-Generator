/**
 * Species-level skill medians and variance for named characters.
 *
 * Role / office / upbringing biases still stack on top (skillGeneration.ts).
 * Design notes:
 * - Long-lived folk: lower median Martial (few mass-army command opportunities);
 *   higher skill σ so century-scale outliers (masters) appear more often.
 * - Orcs: Prowess ≫ baseline, Martial near human — fertility + war culture ≈ field hours.
 * - Draconic: top Prowess, weak Martial; pride depresses Diplomacy / Engineering.
 * - Goblins: enemy-dedicated roster only (see raceRoster); warband-oriented means here.
 * - Arachnids: enemy-dedicated lair/brood nests — predatory, not multi-folk neighbors.
 */
import type { RaceKey } from "../../types/models";
import type { CharacterRoleClass, CharacterSkills } from "./characterTypes";

/** Additive mean shifts vs baseline skill median (same shape as skillGeneration SkillMeanTable). */
export type RaceSkillMeanTable = Partial<Record<keyof CharacterSkills, number>>;

/** Additive mean shifts vs SKILL_BASE_MEAN (before role / primary). */
export const RACE_SKILL_BIAS: Readonly<Record<string, RaceSkillMeanTable>> = {
  human: {},
  unknown: {},
  // Sparse large-army culture; personal skill and study over mass war.
  elf: {
    martial: -8,
    prowess: 4,
    learning: 6,
    artistry: 4,
    geography: 2
  },
  dark_elf: {
    martial: -6,
    prowess: 3,
    intrigue: 6,
    learning: 3,
    diplomacy: -3,
    artistry: 2
  },
  // Clan households + craft; slightly less Martial penalty than elves (tunnel war).
  dwarf: {
    martial: -3,
    prowess: 1,
    engineering: 8,
    stewardship: 2,
    learning: 1
  },
  // Field experience fills Martial to human thickness; body still leads.
  orc: {
    martial: 0,
    prowess: 10,
    learning: -4,
    diplomacy: -4,
    artistry: -4,
    engineering: -2,
    intrigue: -2
  },
  // Enemy warbands / raiders — not court diplomats.
  goblin: {
    martial: 2,
    prowess: 6,
    intrigue: 4,
    diplomacy: -12,
    learning: -6,
    stewardship: -5,
    artistry: -4,
    engineering: -3
  },
  giant: {
    martial: -8,
    prowess: 8,
    learning: -2,
    diplomacy: -4,
    engineering: -3
  },
  // Apex personal threat; poor mass command; pride at diplomacy & craft.
  draconic: {
    martial: -12,
    prowess: 14,
    diplomacy: -8,
    engineering: -6,
    learning: 2,
    intrigue: 2,
    artistry: 1
  },
  amazones: {
    martial: 2,
    prowess: 4,
    learning: -1
  },
  // Lair predators: ambush / web craft, not diplomacy or mass drill with other folk.
  arachnid: {
    martial: -4,
    prowess: 6,
    intrigue: 8,
    diplomacy: -14,
    learning: -4,
    stewardship: -6,
    artistry: -4,
    engineering: 2, // web architecture as "structure", not civil engineering
    geography: 3
  }
};

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
 * Races that only appear as enemy / threat characters (not mixed-court staff,
 * merchants, or guildfolk). Shared machinery for goblin warbands and arachnid nests.
 *
 * Lore: goblins are incompatible raiders; arachnids are predatory nest-dwellers
 * that trap and consume prey — co-residence with other races is not viable.
 */
export const ENEMY_DEDICATED_RACE_KEYS: ReadonlySet<string> = new Set(["goblin", "arachnid"]);

export function isEnemyDedicatedRaceKey(raceKey: string | undefined | null): boolean {
  return !!raceKey && ENEMY_DEDICATED_RACE_KEYS.has(raceKey);
}

/**
 * Roles allowed for enemy-dedicated races: nest/brood leaders and war command.
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

/** Keep only martial-primary offices for enemy mono courts (goblin / arachnid). */
export function filterOfficesForEnemyRace<T extends { primarySkill?: string }>(offices: readonly T[]): T[] {
  return offices.filter(o => o.primarySkill === "martial");
}
