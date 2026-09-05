/**
 * Per-culture "how readily this people adopts permanent modern infrastructure and institutions"
 * trait, 0..1 (docs/plan/modern-urban-water-treatment-and-governance.md).
 *
 * Mirrors src/utils/cultureKnowledgeValue.ts's shape exactly (same rationale for living in
 * src/utils/ rather than src/extensions/economy/ — both the core cultures-generator.ts and the
 * Economy extension need to read it, and a core generator importing from an extension, or vice
 * versa, would violate the extension boundary, AGENTS.md §7.3). Kept as its own module rather
 * than folded into cultureKnowledgeValue.ts because the two traits answer different questions
 * (scholarship vs. readiness to invest in fixed works) and are rolled from independent priors —
 * a culture can be bookish but itinerant, or technically shallow but eager to build.
 *
 * This module only rolls and reads the trait. Nothing yet gates on it — the Phase 1 water/sewer
 * system it is meant to feed (docs/plan/modern-urban-water-treatment-and-governance.md §8) is
 * still unimplemented. See that doc's "文化とmodernizationAffinity" section for the intended hook.
 */

import type { Culture, CultureType } from "../types/models";

/**
 * Per-CultureType mean for the gaussian roll below. Ordered roughly low → high:
 * - Nomadic (0.08): a mobile lifestyle has no fixed site to sink permanent works into —
 *   this is the case that motivated the whole trait (docs/plan/modern-urban-water-treatment-
 *   and-governance.md's "遊牧なら上下水道は考えにくい").
 * - Hunting (0.15) / Desert (0.2): low population density and/or reliance on wells and
 *   seasonal camps over fixed municipal works, but not zero — a hunting band can settle, an
 *   oasis caravan town can grow rich enough to build.
 * - Highland (0.3): reachable, but rail/pipe/road grade and distance from lowland industry
 *   delay adoption relative to flatland neighbors.
 * - Marsh (0.35): dense delta/polder farming can be genuinely urban, but drainage engineering
 *   is a harder and more expensive prerequisite than a plain river intake.
 * - Generic (0.4): no strong pull either way.
 * - Lake (0.5) / River (0.55) / Naval (0.55): historically the first to modernize — water
 *   power, cheap bulk transport, and port-borne trade/technology diffusion.
 * - Colonial (0.7): infrastructure standards transplanted from the metropole rather than
 *   organically grown, so nominally high — see the doc's own caveat that this can be uneven
 *   across a colonial city's quarters, which this single scalar does not capture.
 * - Industrial (0.85): the archetype this whole roadmap exists to serve — see cultures-
 *   generator.ts's defineCultureType for its era gate.
 */
export const MODERNIZATION_AFFINITY_PRIOR: Record<CultureType, number> = {
  Generic: 0.4,
  River: 0.55,
  Lake: 0.5,
  Naval: 0.55,
  Highland: 0.3,
  Hunting: 0.15,
  Nomadic: 0.08,
  Desert: 0.2,
  Marsh: 0.35,
  Industrial: 0.85,
  Colonial: 0.7
};

const DEFAULT_PRIOR = MODERNIZATION_AFFINITY_PRIOR.Generic;
/** Standard deviation for the per-culture roll around its type's prior. */
const MODERNIZATION_AFFINITY_DEVIATION = 0.12;

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
 * Rolls a fresh modernizationAffinity for a culture of the given type. Called once per culture at
 * generation time (cultures-generator.ts) and to hydrate legacy saves/locked cultures missing
 * the field.
 */
export function rollCultureModernizationAffinity(
  type: CultureType | undefined,
  rng: () => number = Math.random
): number {
  const prior = (type && MODERNIZATION_AFFINITY_PRIOR[type]) ?? DEFAULT_PRIOR;
  return clamp01(gaussianSample(prior, MODERNIZATION_AFFINITY_DEVIATION, rng));
}

/**
 * Reads a culture's modernizationAffinity, falling back to its type's prior when the field is
 * absent (legacy saves generated before this trait existed) or non-finite. Never throws — safe
 * to call on any partial/legacy Culture record.
 */
export function getCultureModernizationAffinity(culture: Pick<Culture, "type" | "modernizationAffinity">): number {
  const { modernizationAffinity } = culture;
  if (typeof modernizationAffinity === "number" && Number.isFinite(modernizationAffinity)) {
    return modernizationAffinity;
  }
  return (culture.type && MODERNIZATION_AFFINITY_PRIOR[culture.type]) ?? DEFAULT_PRIOR;
}
