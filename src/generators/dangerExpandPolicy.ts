/**
 * State expansion / polity assignment policy vs cells.danger.
 * Spec: docs/plan/wild-oikoumene-frontier.md Phase 2.
 *
 * High danger is not state territory: ban claim entirely.
 * Moderate danger is traversable only at high cost (standard flood-fill).
 */

/** At or above this danger, cells cannot become state territory (except already locked/capital). */
export const STATE_EXPAND_DANGER_BAN = 80;

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
