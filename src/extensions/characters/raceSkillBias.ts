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
import { isEnemyColonyRaceKey } from "../../data/raceCivicStance";
import type { RaceKey } from "../../types/models";
import type { CharacterRoleClass, CharacterSkills } from "./characterTypes";

/** Additive mean shifts vs baseline skill median (same shape as skillGeneration SkillMeanTable). */
export type RaceSkillMeanTable = Partial<Record<keyof CharacterSkills, number>>;

/** Additive mean shifts vs SKILL_BASE_MEAN (before role / primary). */
export const RACE_SKILL_BIAS: Readonly<Record<string, RaceSkillMeanTable>> = {
  human: {},
  unknown: {},
  // Long memory & border guardianship: study and personal skill over mass war.
  // (Higher learning/prowess than v1 — millennia of craft, not archmage-everyone.)
  elf: {
    martial: -8,
    prowess: 6,
    learning: 10,
    artistry: 5,
    geography: 3,
    diplomacy: 3
  },
  // Clan households + craft; slightly less Martial penalty than elves (tunnel war).
  dwarf: {
    martial: -3,
    prowess: 1,
    engineering: 8,
    stewardship: 2,
    learning: 1
  },
  // Enemy colony war-folk: field experience fills Martial to human thickness.
  orc: {
    martial: 0,
    prowess: 10,
    learning: -4,
    diplomacy: -10,
    artistry: -4,
    engineering: -2,
    intrigue: -2,
    stewardship: -3
  },
  // Enemy colony raiders — not court diplomats.
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
  // Distant god-line (Yotunn): cyclopean craft + apex might; keep folk out via
  // secrecy and access control, not libraries or open war. Learning− ≠ stupidity.
  giant: {
    martial: -8,
    prowess: 14,
    engineering: 8,
    artistry: 4,
    learning: -3,
    intrigue: 4,
    diplomacy: -6
  },
  // Distant apex; pride at diplomacy & craft; poor mass command.
  // Merchants/desk work: bound wyrmkin (raceBoundServitors), not dragons.
  draconic: {
    martial: -12,
    prowess: 14,
    diplomacy: -8,
    engineering: -6,
    learning: 2,
    intrigue: 2,
    artistry: 1
  },
  // Bound thralls of draconic realms — trade face, craft, low personal might.
  wyrmkin: {
    stewardship: 6,
    diplomacy: 4,
    intrigue: 2,
    prowess: -4,
    martial: -2,
    artistry: 1,
    learning: -1
  },
  // Distant matriarchal warrior culture — strong, not cosmopolitan.
  amazones: {
    martial: 2,
    prowess: 4,
    learning: -1,
    diplomacy: -3,
    stewardship: 1
  },
  // Distant underdark folk (not colony-enemy; keep distance).
  dark_elf: {
    martial: -6,
    prowess: 3,
    intrigue: 6,
    learning: 3,
    diplomacy: -4,
    artistry: 2
  },
  // Distant infernal courts: personal might and pact-lore.
  demon: {
    intrigue: 6,
    learning: 4,
    prowess: 8
  },
  // Distant wild folk: fieldcraft and personal strength; thin book-learning.
  beastfolk: {
    diplomacy: -2,
    geography: 3,
    learning: -3,
    prowess: 4,
    stewardship: -2
  },
  // Enemy colony nest predators.
  arachnid: {
    martial: -4,
    prowess: 6,
    intrigue: 8,
    diplomacy: -14,
    learning: -4,
    stewardship: -6,
    artistry: -4,
    engineering: 2,
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
 * Enemy-colony races: goblin, orc, arachnid.
 * Alias of civic stance for character-roster filters (no mixed court / merchants).
 */
export const ENEMY_DEDICATED_RACE_KEYS: ReadonlySet<string> = new Set(["goblin", "orc", "arachnid"]);

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
