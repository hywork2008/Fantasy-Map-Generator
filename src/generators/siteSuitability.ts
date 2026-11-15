/**
 * Site terms of a cell's suitability score (rankCells in main.ts; docs/plan/low-habitability-site-bonus.md).
 *
 * Upstream adds the river, coast, harbour, lake and lowland terms to the biome's habitability as fixed
 * points, so a biome that can hardly be worked (boreal peatland, habitability 3) gets most of its
 * score from them and ends up as dense as taiga. A river or a harbour is worth what the land around
 * it can feed: its positive terms are scaled by habitability / `fullBonusHabitability`, capped at 1.
 * Penalties (height above 50, dry or lava lakes) apply in full.
 */

/** Generation option default: habitability from which the site terms count in full. */
export const DEFAULT_SITE_BONUS_FULL_HABITABILITY = 25;

export const SITE_BONUS_FULL_HABITABILITY_LIMITS = { min: 1, max: 100, step: 1 } as const;

export function getSiteBonusWeight(habitability: number, fullBonusHabitability: number): number {
  if (!(fullBonusHabitability > 0)) return 1;
  return Math.max(0, Math.min(1, habitability / fullBonusHabitability));
}

/** Habitability plus the site terms; `siteTerms` lists each term's points, positive or negative. */
export function scoreCellSite(
  habitability: number,
  siteTerms: readonly number[],
  fullBonusHabitability: number
): number {
  const weight = getSiteBonusWeight(habitability, fullBonusHabitability);
  let score = habitability;
  for (const term of siteTerms) score += term > 0 ? term * weight : term;
  return score;
}
