/**
 * Pure scoring/gating math for the Great Library system (docs/plan/great-library.md KD-2/KD-3/KD-4).
 * Every export here is a read-only function of its arguments — no context reads, no mutation — so
 * the borderline test matrix in the design doc can be reproduced exactly without mocking
 * economyContext/charactersContext/nobilityContext. greatLibrary.ts resolves the live State/ruler
 * into these plain inputs and calls into this module.
 */

import type { CharacterCommitment, CommitmentKind } from "../../characters/characterTypes";
import {
  GREAT_LIBRARY_BUDGET_SHARE,
  GREAT_LIBRARY_CULTURE_MIN,
  GREAT_LIBRARY_MAINTAIN_COVERAGE,
  GREAT_LIBRARY_MAINTAIN_RULER_SCORE,
  GREAT_LIBRARY_MAINTAIN_TREASURY_FLOOR,
  GREAT_LIBRARY_MIN_START_COVERAGE,
  GREAT_LIBRARY_REQUIRE_PEACE_TO_START,
  GREAT_LIBRARY_RULER_LEARNING_MIN,
  GREAT_LIBRARY_RULER_SCORE_MIN,
  GREAT_LIBRARY_TARGET_ANNUAL_SPEND,
  GREAT_LIBRARY_TREASURY_FLOOR,
  type GreatLibraryEligibility
} from "./greatLibraryTypes";

/**
 * Commitment-kind → "how much this commitment predisposes a ruler toward scholarship" affinity
 * (docs/plan/great-library.md KD-3). Exhaustive over the current CommitmentKind union.
 */
const COMMITMENT_SCHOLARSHIP_AFFINITY: Record<CommitmentKind, number> = {
  ideology: 1,
  craft: 1,
  domain: 1,
  office: 0.55,
  state: 0.55,
  faith: 0.55,
  nation_culture: 0.35,
  people: 0.35,
  family: 0.3,
  house: 0.3,
  liege: 0.3,
  patron: 0.3,
  comrades: 0.3,
  wealth: 0,
  self: 0,
  hedonism: 0,
  rivalry: 0
};
/** Fallback for a commitment kind outside the current CommitmentKind union (forward-compat, e.g. a future "scholarship" kind). */
const DEFAULT_COMMITMENT_AFFINITY = 0.25;

function affinityOfKind(kind: string): number {
  return (COMMITMENT_SCHOLARSHIP_AFFINITY as Partial<Record<string, number>>)[kind] ?? DEFAULT_COMMITMENT_AFFINITY;
}

/**
 * Weighted average of primary/secondary commitment affinity; a missing `weight` defaults to 1
 * (docs/plan/great-library.md KD-3).
 */
export function commitmentScholarshipAffinity(commitment: CharacterCommitment | undefined): number {
  if (!commitment?.primary) return DEFAULT_COMMITMENT_AFFINITY;

  const primaryWeight = commitment.primary.weight ?? 1;
  const primaryAffinity = affinityOfKind(commitment.primary.kind);
  if (!commitment.secondary) return primaryAffinity;

  const secondaryWeight = commitment.secondary.weight ?? 1;
  const secondaryAffinity = affinityOfKind(commitment.secondary.kind);
  const totalWeight = primaryWeight + secondaryWeight;
  if (!(totalWeight > 0)) return primaryAffinity;
  return (primaryAffinity * primaryWeight + secondaryAffinity * secondaryWeight) / totalWeight;
}

/**
 * True for state forms whose central patronage should weigh piety alongside rationality
 * (docs/plan/great-library.md KD-3, r4 product decision). Deliberately mirrors only the
 * form/formName branches of characterLifecycle.ts's isReligiousForm — its `primarySkill ===
 * "learning"` branch is for central-office personality rolls, not state-form classification.
 */
export function isGreatLibraryTheocracyState(state: { form?: string; formName?: string }): boolean {
  if (state.form === "Theocracy") return true;
  if (state.formName && ["Theocracy", "Holy State", "Bishopric"].includes(state.formName)) return true;
  return false;
}

export interface GreatLibraryRulerScoreInput {
  /** Raw character.skills.learning (0..100) — v1 deliberately does not use api.getEffectiveSkill (KD-3). */
  learning: number;
  rationality: number;
  zeal: number;
  greed: number;
  /** Only read when isTheocracy is true. */
  piety: number;
  commitmentAffinity: number;
  isTheocracy: boolean;
}

/** 0..1 "how much this ruler's patronage values knowledge" (docs/plan/great-library.md KD-3). */
export function computeValuesKnowledge(input: GreatLibraryRulerScoreInput): number {
  const rat = input.rationality / 100;
  const zeal = input.zeal / 100;
  const greedInv = 1 - input.greed / 100;
  const aff = input.commitmentAffinity;

  if (input.isTheocracy) {
    const piety = input.piety / 100;
    return 0.3 * rat + 0.15 * piety + 0.25 * aff + 0.2 * zeal * aff + 0.1 * greedInv;
  }
  return 0.4 * rat + 0.25 * aff + 0.2 * zeal * aff + 0.15 * greedInv;
}

/** excellence * (0.35 + 0.65 * valuesKnowledge) — docs/plan/great-library.md KD-3. */
export function computeRulerScore(input: GreatLibraryRulerScoreInput): number {
  const excellence = input.learning / 100;
  return excellence * (0.35 + 0.65 * computeValuesKnowledge(input));
}

/** Already-resolved ruler traits — undefined when there is no living, resolvable ruler. */
export interface GreatLibraryRulerTraits {
  learning: number;
  rationality: number;
  zeal: number;
  greed: number;
  piety: number;
  commitmentAffinity: number;
}

export interface GreatLibraryEligibilityInput {
  /** Culture.knowledgeValue via getCultureKnowledgeValue() (KD-2). */
  cultureKnowledgeValue: number;
  /** undefined when Characters is disabled, the throne is vacant, or the ruler is dead. */
  ruler?: GreatLibraryRulerTraits;
  isTheocracy: boolean;
  treasury: number;
  /** True when the state has a declared "Enemy" diplomacy relation with any other state (KD-4 W3). */
  hasEnemyDiplomacy: boolean;
  /** True when the state already has an active (planning/building/paused/completed) project (§一国家一館). */
  alreadyHasLibrary: boolean;
}

function projectedCoverageOf(treasury: number): number {
  return Math.min(1, (treasury * GREAT_LIBRARY_BUDGET_SHARE) / GREAT_LIBRARY_TARGET_ANNUAL_SPEND);
}

/** Full triple-condition + wealth + peace start-eligibility check (docs/plan/great-library.md KD-2/3/4). */
export function checkGreatLibraryEligibility(input: GreatLibraryEligibilityInput): GreatLibraryEligibility {
  const cultureOk = input.cultureKnowledgeValue >= GREAT_LIBRARY_CULTURE_MIN;

  const learning = input.ruler?.learning ?? 0;
  const rulerScore = input.ruler ? computeRulerScore({ ...input.ruler, isTheocracy: input.isTheocracy }) : 0;
  const rulerOk =
    input.ruler !== undefined &&
    learning >= GREAT_LIBRARY_RULER_LEARNING_MIN &&
    rulerScore >= GREAT_LIBRARY_RULER_SCORE_MIN;

  const treasury = Math.max(0, input.treasury);
  const projectedCoverage = projectedCoverageOf(treasury);
  const wealthOk = treasury >= GREAT_LIBRARY_TREASURY_FLOOR && projectedCoverage >= GREAT_LIBRARY_MIN_START_COVERAGE;

  const peaceOk = !GREAT_LIBRARY_REQUIRE_PEACE_TO_START || !input.hasEnemyDiplomacy;

  const eligible = cultureOk && rulerOk && wealthOk && peaceOk && !input.alreadyHasLibrary;

  return {
    eligible,
    cultureOk,
    rulerOk,
    wealthOk,
    peaceOk,
    alreadyHasLibrary: input.alreadyHasLibrary,
    scores: { knowledgeValue: input.cultureKnowledgeValue, rulerScore, learning, treasury, projectedCoverage }
  };
}

export interface GreatLibraryMaintainInput {
  ruler?: GreatLibraryRulerTraits;
  isTheocracy: boolean;
  treasury: number;
}

export interface GreatLibraryMaintainResult {
  ok: boolean;
  rulerOk: boolean;
  treasuryOk: boolean;
  coverageOk: boolean;
  rulerScore: number;
  projectedCoverage: number;
}

/** Looser gate checked every settle year while building/paused (docs/plan/great-library.md §Maintainゲート). */
export function checkGreatLibraryMaintain(input: GreatLibraryMaintainInput): GreatLibraryMaintainResult {
  const rulerScore = input.ruler ? computeRulerScore({ ...input.ruler, isTheocracy: input.isTheocracy }) : 0;
  const rulerOk = input.ruler !== undefined && rulerScore >= GREAT_LIBRARY_MAINTAIN_RULER_SCORE;

  const treasury = Math.max(0, input.treasury);
  const projectedCoverage = projectedCoverageOf(treasury);
  const treasuryOk = treasury >= GREAT_LIBRARY_MAINTAIN_TREASURY_FLOOR;
  const coverageOk = projectedCoverage >= GREAT_LIBRARY_MAINTAIN_COVERAGE;

  return { ok: rulerOk && treasuryOk && coverageOk, rulerOk, treasuryOk, coverageOk, rulerScore, projectedCoverage };
}
