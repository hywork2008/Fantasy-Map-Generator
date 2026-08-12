/**
 * Per-culture "how much this people values learning/scholarship" trait, 0..1
 * (docs/plan/great-library.md KD-2).
 *
 * Lives in `src/utils/` rather than `src/extensions/economy/` because both the core
 * `cultures-generator.ts` and the Economy extension need to read it, and a core generator
 * importing from an extension (or vice versa importing the prior table) would violate the
 * extension boundary (AGENTS.md §7.3) — Economy imports this module, this module never imports
 * from Economy.
 */

import type { Culture, CultureType } from "../types/models";

/** Per-CultureType mean for the gaussian roll below (docs/plan/great-library.md KD-2). */
export const KNOWLEDGE_VALUE_PRIOR: Record<CultureType, number> = {
  Generic: 0.45,
  River: 0.5,
  Lake: 0.5,
  Naval: 0.48,
  Highland: 0.4,
  Hunting: 0.28,
  Nomadic: 0.22
};

const DEFAULT_PRIOR = KNOWLEDGE_VALUE_PRIOR.Generic;
/** Standard deviation for the per-culture roll around its type's prior (docs/plan/great-library.md KD-2). */
const KNOWLEDGE_VALUE_DEVIATION = 0.12;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Box-Muller transform sourced from an injectable rng (defaults to Math.random so callers that
 * reseed it globally, e.g. cultures-generator.ts's `Math.random = Alea(seed)`, get a deterministic
 * roll for free). Kept local rather than reusing utils/probabilityUtils.ts's `gauss()` so this
 * module stays free of the d3 dependency and is trivially unit-testable with a fake rng.
 */
function gaussianSample(mean: number, deviation: number, rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON); // avoid log(0)
  const u2 = rng();
  const standardNormal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + standardNormal * deviation;
}

/**
 * Rolls a fresh knowledgeValue for a culture of the given type. Called once per culture at
 * generation time (cultures-generator.ts) and to hydrate legacy saves/locked cultures missing
 * the field.
 */
export function rollCultureKnowledgeValue(type: CultureType | undefined, rng: () => number = Math.random): number {
  const prior = (type && KNOWLEDGE_VALUE_PRIOR[type]) ?? DEFAULT_PRIOR;
  return clamp01(gaussianSample(prior, KNOWLEDGE_VALUE_DEVIATION, rng));
}

/**
 * Reads a culture's knowledgeValue, falling back to its type's prior when the field is absent
 * (legacy saves generated before this trait existed) or non-finite. Never throws — safe to call
 * on any partial/legacy Culture record.
 */
export function getCultureKnowledgeValue(culture: Pick<Culture, "type" | "knowledgeValue">): number {
  const { knowledgeValue } = culture;
  if (typeof knowledgeValue === "number" && Number.isFinite(knowledgeValue)) return knowledgeValue;
  return (culture.type && KNOWLEDGE_VALUE_PRIOR[culture.type]) ?? DEFAULT_PRIOR;
}
