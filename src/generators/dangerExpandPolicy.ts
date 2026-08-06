/**
 * State expansion / polity assignment policy vs cells.danger.
 * Spec: docs/plan/wild-oikoumene-frontier.md Phase 2.
 *
 * High danger is not state territory: ban claim entirely.
 * Moderate danger is traversable only at high cost (standard flood-fill).
 *
 * Settlement suitability uses the same ban threshold so monster domains
 * (danger ≥ 80) cannot hold rural population — see dangerSuitabilityMultiplier.
 */

/** At or above this danger, cells cannot become state territory (except already locked/capital). */
export const STATE_EXPAND_DANGER_BAN = 80;

/**
 * Danger at or above this fully zeros settlement suitability (`cells.s` / capacity).
 * Kept equal to the expand ban so monster_domain, unclaimable land, and empty
 * countryside share one threshold.
 *
 * Historical rankCells used `1 - danger/200`, which only zeroed the calamity
 * epicenter (additive peak 200) and left ~60% population at danger 80 — the
 * same ring states are forbidden to claim.
 */
export const SETTLEMENT_DANGER_ZERO = STATE_EXPAND_DANGER_BAN;

/**
 * Cost added per danger point when expanding (standard flood-fill path).
 * danger 40 → +1200 before expansionism divide — strongly prefers safer land.
 */
export const STATE_EXPAND_DANGER_COST_PER_UNIT = 30;

/**
 * Frontier outposts: same ban threshold so annual expansion matches generation policy.
 * (Previously 120, which allowed claiming high-danger monster rings.)
 */
export const FRONTIER_OUTPOST_MAX_DANGER = STATE_EXPAND_DANGER_BAN - 1; // 79

/**
 * @returns extra path cost for expand, or `null` if the cell is banned from annexation.
 */
export function getStateExpandDangerCost(danger: number | undefined | null): number | null {
  const d = danger ?? 0;
  if (d >= STATE_EXPAND_DANGER_BAN) return null;
  if (d <= 0) return 0;
  return d * STATE_EXPAND_DANGER_COST_PER_UNIT;
}

/** True if a land cell may be painted with a state id under danger rules. */
export function canStateClaimCell(danger: number | undefined | null): boolean {
  return getStateExpandDangerCost(danger) !== null;
}

/**
 * Multiplier applied to settlement suitability / capacity from local danger.
 * Linear: 0 → 1, SETTLEMENT_DANGER_ZERO → 0. Used by rankCells and foundation scoring.
 */
export function dangerSuitabilityMultiplier(danger: number | undefined | null): number {
  const d = danger ?? 0;
  if (d <= 0) return 1;
  if (d >= SETTLEMENT_DANGER_ZERO) return 0;
  return 1 - d / SETTLEMENT_DANGER_ZERO;
}
