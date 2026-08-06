/**
 * Cull / pest mission practice credit for individualSkills (EQ-4).
 * Spec: docs/plan/character-loadout-and-readiness.md §7.
 *
 * Does not inflate base Character.skills (K5). Commander annual growth is untouched.
 */
import type { Character } from "../../characters/characterTypes";
import { getSimulationYear } from "../economyContext";
import { getIndividualSkill } from "./individualSkillMastery";
import type { AptitudeTier } from "./individualSkillTypes";
import { ensureMartialDomainSkill, type MartialIndividualDomain } from "./martialIndividualMastery";
import type { CullEcologyOutcome } from "./threatCullHireTypes";

/** Outcome → base practice points before aptitude / diminishing returns. */
export const CULL_PRACTICE_BASE_GAIN: Readonly<Record<CullEcologyOutcome, number>> = {
  success: 0.85,
  partial: 0.5,
  fail: 0.18,
  dead: 0
};

/** Injury multiplies the outcome base (still some learning from a hard fight). */
export const CULL_PRACTICE_INJURED_MULTIPLIER = 0.65;

const APTITUDE_GROWTH: Readonly<Record<AptitudeTier, number>> = {
  poor: 0.8,
  ordinary: 1,
  promising: 1.12,
  gifted: 1.25,
  exceptional: 1.4
};

function clampProficiency(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

/** Same diminishing-returns curve as commander annual practice. */
export function cullPracticeDiminishingReturns(proficiency: number): number {
  const base = Math.max(0.05, 1 - proficiency / 120);
  return proficiency >= 90 ? base * 0.4 : base;
}

/**
 * Base gain after outcome and injury, before aptitude / diminishing returns.
 * Pure — no skill mutation.
 */
export function cullPracticeBaseGain(outcome: CullEcologyOutcome, injured: boolean): number {
  const base = CULL_PRACTICE_BASE_GAIN[outcome] ?? 0;
  if (!(base > 0)) return 0;
  return injured ? base * CULL_PRACTICE_INJURED_MULTIPLIER : base;
}

/**
 * Final proficiency delta for one mission.
 * Pure — does not mutate skills.
 */
export function cullPracticeGain(currentProficiency: number, baseGain: number, aptitude: AptitudeTier): number {
  if (!(baseGain > 0) || currentProficiency >= 100) return 0;
  const raw = baseGain * APTITUDE_GROWTH[aptitude] * cullPracticeDiminishingReturns(currentProficiency);
  const next = clampProficiency(currentProficiency + raw);
  return Math.max(0, Math.round((next - currentProficiency) * 100) / 100);
}

/**
 * Which martial domain this mission trains.
 * Prefer bow/archery style keys; else the hunter's stronger existing domain; default swordsmanship.
 */
export function selectCullPracticeDomain(character: Character): MartialIndividualDomain {
  const style = character.loadout?.weapon?.styleKey ?? "";
  if (/bow|archery|ranged|hunting_bow/i.test(style)) return "archery";

  const sword = getIndividualSkill(character.i, "swordsmanship")?.proficiency ?? 0;
  const bow = getIndividualSkill(character.i, "archery")?.proficiency ?? 0;
  if (bow > sword + 5) return "archery";
  return "swordsmanship";
}

export interface CullPracticeCreditResult {
  domain: MartialIndividualDomain;
  before: number;
  after: number;
  gain: number;
}

/**
 * Apply one named-hunter mission's practice credit.
 * Creates the domain skill row if missing (from martial aptitude seed).
 * Returns null when there is nothing to gain (dead outcome, zero base, already at 100).
 */
export function applyCullPracticeCredit(
  character: Character,
  outcome: CullEcologyOutcome,
  injured: boolean
): CullPracticeCreditResult | null {
  if (character.dead) return null;

  const baseGain = cullPracticeBaseGain(outcome, injured);
  if (!(baseGain > 0)) return null;

  const domain = selectCullPracticeDomain(character);
  const skill = ensureMartialDomainSkill(character, domain);
  const before = skill.proficiency;
  const gain = cullPracticeGain(before, baseGain, skill.aptitude);
  if (!(gain > 0)) return null;

  skill.proficiency = clampProficiency(before + gain);
  skill.lastPracticedYear = getSimulationYear();
  return { domain, before, after: skill.proficiency, gain };
}
