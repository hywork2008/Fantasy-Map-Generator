/**
 * Role-, stratum-, and upbringing-biased skill rolls for createPerson / backstory.
 *
 * Replaces uniform rand(1,100) with gaussian draws around occupation-appropriate
 * medians so e.g. merchants rarely spawn as martial geniuses and field commanders
 * tend high in martial/prowess. Secondary pass in applyCharacterBackstory nudges
 * means by social stratum (家業・出自) and raisedIn (成育環境).
 */
import { gauss } from "../hostUtils";
import type { Character, CharacterRoleClass, CharacterSkills, RaisedIn, SocialStratum } from "./characterTypes";

/** Baseline median for untrained skills (1–100 scale). */
export const SKILL_BASE_MEAN = 50;

/**
 * Default spread: ~2/3 of rolls within ±16 of the mean.
 * Uniform 1–100 has σ≈28.9 — this keeps extremes uncommon unless the mean is high.
 */
export const SKILL_STDDEV = 16;

/**
 * How far primarySkill (office / craft focus) pulls its own mean above baseline.
 * Kept moderate so office holders are competent without a pile-up at 100
 * (martial used to stack primary + role + camp into a Lü Bu in every court).
 */
export const PRIMARY_SKILL_BOOST = 14;

/**
 * Martial / prowess primaries are intentionally colder than desk skills:
 * extreme fighters and strategists should be rare, not default court furniture.
 */
export const MARTIAL_PRIMARY_BOOST = 10;
export const PROWESS_PRIMARY_BOOST = 10;

/** Soft floor for the designated primary skill so office holders stay competent. */
export const PRIMARY_SKILL_MIN = 40;

/** Background (stratum + raisedIn) may not push martial/prowess more than this either way. */
export const MARTIAL_BACKGROUND_CAP = 10;
export const PROWESS_BACKGROUND_CAP = 10;

const ALL_SKILLS: readonly (keyof CharacterSkills)[] = [
  "artistry",
  "diplomacy",
  "engineering",
  "geography",
  "intrigue",
  "learning",
  "martial",
  "prowess",
  "stewardship"
] as const;

export type SkillMeanTable = Partial<Record<keyof CharacterSkills, number>>;

/**
 * Occupation / role-class deltas relative to SKILL_BASE_MEAN.
 * Applied at createPerson time (callers know the intended role).
 */
export const ROLE_SKILL_BIAS: Record<CharacterRoleClass, SkillMeanTable> = {
  ruler: {
    diplomacy: 12,
    stewardship: 12,
    martial: 3,
    intrigue: 5,
    learning: 5,
    geography: 5,
    prowess: 0,
    artistry: 3
  },
  // Court offices rely mainly on primarySkill; mild general competence only.
  central_officer: {
    diplomacy: 4,
    stewardship: 4,
    intrigue: 4,
    learning: 3
  },
  // Martial/prowess medians stay "good officer" (~mid-50s–60s), not generational genius.
  commander: {
    martial: 8,
    prowess: 4,
    geography: 8,
    stewardship: -6,
    diplomacy: -5,
    intrigue: -4,
    learning: -5,
    artistry: -8,
    engineering: 2
  },
  province_lord: {
    martial: 5,
    prowess: 2,
    stewardship: 8,
    geography: 8,
    diplomacy: 5,
    intrigue: 2
  },
  merchant: {
    stewardship: 16,
    diplomacy: 10,
    intrigue: 6,
    geography: 5,
    engineering: 4,
    artistry: 3,
    martial: -14,
    prowess: -12,
    learning: -2
  },
  religious: {
    learning: 18,
    diplomacy: 5,
    artistry: 5,
    stewardship: 2,
    martial: -12,
    prowess: -10,
    intrigue: -4,
    engineering: -4
  },
  ordinary: {}
};

/**
 * Birth stratum / family-trade deltas (additive on top of already-rolled skills).
 * merchant_born depresses martial so commercial lineages don't flood the roster
 * with war geniuses; slave_born / military-adjacent strata lift prowess.
 */
export const STRATUM_SKILL_BIAS: Record<SocialStratum, SkillMeanTable> = {
  royal: { diplomacy: 6, stewardship: 4, artistry: 4, martial: 1, prowess: -4, intrigue: 3 },
  high_noble: { diplomacy: 5, martial: 2, stewardship: 3, learning: 2, prowess: 1 },
  minor_noble: { martial: 2, prowess: 2, stewardship: 3, geography: 2 },
  gentry: { stewardship: 5, learning: 4, diplomacy: 2, martial: 1 },
  commoner: { prowess: 1, martial: 1, stewardship: 1, learning: -3, diplomacy: -2, artistry: -2 },
  merchant_born: {
    stewardship: 8,
    intrigue: 4,
    diplomacy: 3,
    artistry: 2,
    martial: -10,
    prowess: -8,
    learning: -2
  },
  clergy_orphan: {
    learning: 10,
    artistry: 3,
    diplomacy: 2,
    martial: -6,
    prowess: -6,
    stewardship: -2,
    intrigue: -2
  },
  freedman: { prowess: 3, martial: 1, intrigue: 2, diplomacy: -3, stewardship: -2, learning: -3 },
  slave_born: {
    prowess: 4,
    martial: 2,
    intrigue: 2,
    stewardship: -5,
    diplomacy: -5,
    learning: -5,
    artistry: -3
  },
  foreigner: { geography: 8, diplomacy: 3, intrigue: 2, learning: 2 },
  unknown: {}
};

/** Childhood environment deltas — military_camp / merchant_quarter / monastery matter most. */
export const RAISED_IN_SKILL_BIAS: Record<RaisedIn, SkillMeanTable> = {
  capital_court: { diplomacy: 8, intrigue: 6, stewardship: 3, artistry: 3, prowess: -5, martial: -2 },
  capital_city: { stewardship: 3, artistry: 3, diplomacy: 3, intrigue: 2 },
  provincial_seat: { stewardship: 3, martial: 1, diplomacy: 2, geography: 2 },
  frontier_burg: { martial: 3, prowess: 2, geography: 6, artistry: -3, learning: -2 },
  rural_manor: { stewardship: 4, martial: 1, prowess: 1, intrigue: -2 },
  monastery: {
    learning: 12,
    artistry: 4,
    diplomacy: 2,
    martial: -6,
    prowess: -6,
    intrigue: -3,
    stewardship: -2
  },
  // Camp life still favors personal combat over strategy, but not +14 ceiling pressure.
  military_camp: {
    martial: 5,
    prowess: 6,
    geography: 5,
    engineering: 2,
    stewardship: -5,
    artistry: -6,
    learning: -5,
    diplomacy: -4
  },
  merchant_quarter: {
    stewardship: 8,
    intrigue: 4,
    diplomacy: 3,
    geography: 2,
    martial: -6,
    prowess: -6
  },
  foreign_court: { diplomacy: 8, geography: 6, intrigue: 4, learning: 2, stewardship: 2 },
  street: {
    prowess: 4,
    intrigue: 6,
    martial: 1,
    learning: -5,
    diplomacy: -4,
    stewardship: -5,
    artistry: -3
  }
};

/**
 * When a skill is the office/craft primary, related skills get a smaller lift so
 * e.g. a Marshal is not only a paper general (martial) with 1 prowess.
 */
const PRIMARY_ADJACENT: Partial<Record<keyof CharacterSkills, SkillMeanTable>> = {
  martial: { prowess: 3, geography: 4 },
  prowess: { martial: 3 },
  stewardship: { geography: 3, diplomacy: 2 },
  diplomacy: { intrigue: 2, stewardship: 2 },
  intrigue: { diplomacy: 2 },
  learning: { artistry: 3 },
  engineering: { geography: 3, stewardship: 2 },
  geography: { martial: 1 },
  artistry: { learning: 2 }
};

export interface RollSkillsOptions {
  primarySkill?: keyof CharacterSkills;
  roleClass?: CharacterRoleClass;
}

function clampSkill(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

/** Integer skill sample from N(mean, SKILL_STDDEV), optionally hard-floored. */
export function rollSkillValue(mean: number, min = 1, max = 100): number {
  return clampSkill(gauss(mean, SKILL_STDDEV, min, max, 0));
}

/**
 * Resolve the gaussian mean for one skill before the draw.
 * primarySkill stacks with role bias without double-counting full boosts.
 */
export function skillMeanFor(
  skill: keyof CharacterSkills,
  options: RollSkillsOptions = {}
): { mean: number; min: number } {
  const roleBias = (options.roleClass ? ROLE_SKILL_BIAS[options.roleClass][skill] : undefined) ?? 0;
  const isPrimary = options.primarySkill === skill;
  const adjacent =
    options.primarySkill && options.primarySkill !== skill ? (PRIMARY_ADJACENT[options.primarySkill]?.[skill] ?? 0) : 0;

  let mean = SKILL_BASE_MEAN + roleBias + adjacent;
  let min = 1;

  if (isPrimary) {
    // Combat primaries use a colder boost so courts are not full of 100-cap legends.
    const primaryBoost =
      skill === "martial" ? MARTIAL_PRIMARY_BOOST : skill === "prowess" ? PROWESS_PRIMARY_BOOST : PRIMARY_SKILL_BOOST;
    // Pull toward a competent professional band; absorb overlapping role bias.
    mean = SKILL_BASE_MEAN + primaryBoost + roleBias * 0.5;
    min = PRIMARY_SKILL_MIN;
  }

  return { mean, min };
}

/** Roll a full CharacterSkills block for a new person. */
export function rollCharacterSkills(options: RollSkillsOptions = {}): CharacterSkills {
  const skills = {} as CharacterSkills;
  for (const skill of ALL_SKILLS) {
    const { mean, min } = skillMeanFor(skill, options);
    skills[skill] = rollSkillValue(mean, min);
  }
  return skills;
}

/**
 * Post-roll nudges once origin.socialStratum / raisedIn are known.
 * Shifts existing values (preserves relative RNG) rather than re-rolling.
 * Deltas are capped so a single axis cannot shove a skill more than ±18
 * (tighter caps for martial/prowess — prevents camp+noble stacking to 100).
 */
export function applyBackgroundSkillBias(skills: CharacterSkills, stratum: SocialStratum, raisedIn: RaisedIn): void {
  const stratumBias = STRATUM_SKILL_BIAS[stratum] ?? {};
  const raisedBias = RAISED_IN_SKILL_BIAS[raisedIn] ?? {};

  for (const skill of ALL_SKILLS) {
    const delta = (stratumBias[skill] ?? 0) + (raisedBias[skill] ?? 0);
    if (delta === 0) continue;
    const cap = skill === "martial" ? MARTIAL_BACKGROUND_CAP : skill === "prowess" ? PROWESS_BACKGROUND_CAP : 18;
    const capped = Math.max(-cap, Math.min(cap, delta));
    skills[skill] = clampSkill(skills[skill] + capped);
  }
}

/** Keep abilityProfile.values in sync when skills change after creation. */
export function syncCk3AbilityProfileSkills(character: Character): void {
  if (character.abilityProfile?.presetId !== "ck3e") return;
  for (const skill of ALL_SKILLS) {
    character.abilityProfile.values[skill] = character.skills[skill];
  }
}
