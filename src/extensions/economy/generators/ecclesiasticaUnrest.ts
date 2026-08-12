import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";

/**
 * PR-17h (docs/plan/department-budget-spending-effects.md §3.3/non-goals) — Ecclesiastica's
 * funding effect, scoped down from a full religious/cult simulation (religions-generator.ts has
 * no live per-cycle tick to hook into — see the design doc's non-goals). Instead: a neglected
 * Ecclesiastica accumulates `state.religiousUnrest` (0..100, same accumulate/decay shape as
 * treasuryAllocation.ts's militaryDiscontent — high is bad here too), which bleeds into assembly
 * confidence via councilAssembly.ts's getCouncilSupport(). That, in turn, already gates debt
 * issuance, war footing, and all 4 department-budget cuts (PR-17f) — so a state that lets its
 * clergy go unpaid finds *every* council-gated policy harder to pass, not just religion-specific
 * ones. This is a deliberately real, connected consequence rather than an invented cult-growth
 * mechanic this codebase has no infrastructure for yet.
 */

export const RELIGIOUS_UNREST_MAX = 100;
/** Ecclesiastica service level at/above this decays unrest. */
export const RELIGIOUS_UNREST_WELL_FUNDED_LEVEL = 0.8;
/** Ecclesiastica service level at/above this (but below the well-funded tier) only gains weakly. */
export const RELIGIOUS_UNREST_UNDERFUNDED_LEVEL = 0.5;
export const RELIGIOUS_UNREST_DECAY_PER_CYCLE = 5;
export const RELIGIOUS_UNREST_WEAK_GAIN_PER_CYCLE = 3;
export const RELIGIOUS_UNREST_STRONG_GAIN_PER_CYCLE = 8;
/**
 * Theocracy's whole governance identity runs through Ecclesiastica (state-treasury-department-budget.md
 * §1/§3 — 48% baseline share vs 2-12% elsewhere), so neglect stings faster there — mirrors
 * councilVotes.ts's cutEcclesiastica lean, which already makes Theocracy's court resist that cut
 * far harder than other forms.
 */
export const RELIGIOUS_UNREST_THEOCRACY_GAIN_MULTIPLIER = 1.5;

/** Below this, religious unrest does not yet cost assembly support. */
export const RELIGIOUS_UNREST_SUPPORT_PENALTY_FLOOR = 40;
/** Assembly support points lost per unrest point above the floor. */
export const RELIGIOUS_UNREST_SUPPORT_PENALTY_RATE = 0.2;

/**
 * Updates `state.religiousUnrest` from this cycle's Ecclesiastica departmentServiceLevel. Call
 * once per state per collectTaxes() cycle, after allocateTreasury() has refreshed
 * departmentServiceLevel for this cycle.
 */
export function updateReligiousUnrest(state: State): number {
  const ecclesiasticaLevel = state.departmentServiceLevel?.ecclesiastica ?? 1;
  const previous = state.religiousUnrest || 0;
  const theocracyMultiplier = state.form === "Theocracy" ? RELIGIOUS_UNREST_THEOCRACY_GAIN_MULTIPLIER : 1;

  let next: number;
  if (ecclesiasticaLevel >= RELIGIOUS_UNREST_WELL_FUNDED_LEVEL) {
    next = Math.max(0, previous - RELIGIOUS_UNREST_DECAY_PER_CYCLE);
  } else if (ecclesiasticaLevel >= RELIGIOUS_UNREST_UNDERFUNDED_LEVEL) {
    next = Math.min(RELIGIOUS_UNREST_MAX, previous + RELIGIOUS_UNREST_WEAK_GAIN_PER_CYCLE * theocracyMultiplier);
  } else {
    next = Math.min(RELIGIOUS_UNREST_MAX, previous + RELIGIOUS_UNREST_STRONG_GAIN_PER_CYCLE * theocracyMultiplier);
  }
  next = rn(next, 2);
  state.religiousUnrest = next;
  return next;
}

/** Assembly-support penalty this cycle's religiousUnrest currently costs (0 below the floor). */
export function getReligiousUnrestSupportPenalty(state: Pick<State, "religiousUnrest">): number {
  const unrest = state.religiousUnrest || 0;
  if (unrest <= RELIGIOUS_UNREST_SUPPORT_PENALTY_FLOOR) return 0;
  return rn((unrest - RELIGIOUS_UNREST_SUPPORT_PENALTY_FLOOR) * RELIGIOUS_UNREST_SUPPORT_PENALTY_RATE, 2);
}
