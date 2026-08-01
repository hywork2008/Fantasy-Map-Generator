import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import { stateHasEnemy } from "../../hostCore";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getRulerId } from "../../nobility/nobilityContext";
import { getStateMilitaryUpkeep } from "./militaryLogistics";

export interface DepartmentBaselineAllocation {
  marshalcy: number;
  household: number;
  chancery: number;
  stewardship: number;
  spymastery: number;
  ecclesiastica: number;
}

/**
 * Baseline share of this cycle's domestic income (poll tax + voyage income, the same base
 * getStateMilitaryUpkeep() is deducted from in collectTaxes()) each department draws, before
 * any policy adjustment (§4). See docs/plan/state-treasury-department-budget.md §3 for the
 * medieval-governance research this table is grounded in. Values are placeholders, not yet
 * calibrated against real income magnitudes. Each row sums to 1.
 */
export const BASELINE_ALLOCATION_BY_FORM: Record<string, DepartmentBaselineAllocation> = {
  Monarchy: {
    marshalcy: 0.35,
    household: 0.25,
    chancery: 0.15,
    stewardship: 0.12,
    spymastery: 0.05,
    ecclesiastica: 0.08
  },
  Republic: { marshalcy: 0.3, household: 0.05, chancery: 0.3, stewardship: 0.2, spymastery: 0.12, ecclesiastica: 0.03 },
  Theocracy: {
    marshalcy: 0.15,
    household: 0.08,
    chancery: 0.12,
    stewardship: 0.12,
    spymastery: 0.05,
    ecclesiastica: 0.48
  },
  Union: { marshalcy: 0.2, household: 0.08, chancery: 0.4, stewardship: 0.2, spymastery: 0.1, ecclesiastica: 0.02 },
  Anarchy: { marshalcy: 0.75, household: 0.15, chancery: 0.02, stewardship: 0.02, spymastery: 0.06, ecclesiastica: 0 }
};
const DEFAULT_BASELINE_ALLOCATION = BASELINE_ALLOCATION_BY_FORM.Monarchy;

export function getDepartmentBaselineAllocation(state: Pick<State, "form">): DepartmentBaselineAllocation {
  return BASELINE_ALLOCATION_BY_FORM[state.form || ""] ?? DEFAULT_BASELINE_ALLOCATION;
}

export function getHouseholdStipendRate(state: Pick<State, "form">): number {
  return getDepartmentBaselineAllocation(state).household;
}

function isVassalState(state: Pick<State, "diplomacy">): boolean {
  const diplomacy = state.diplomacy;
  if (!diplomacy) return false;
  for (let i = 0; i < diplomacy.length; i++) {
    if (diplomacy[i] === "Vassal") return true;
  }
  return false;
}

/** §4.2 — vassal states' garrisons substitute for their own standing army; Union has no central household force. */
const VASSAL_STRUCTURAL_MULTIPLIER = 0.55;
const UNION_STRUCTURAL_MULTIPLIER = 0.75;
/** §4.2 — how far a deliberate cut is tolerated below the (already structurally-adjusted) baseline before it counts as a risky cut, in peacetime vs. at war. Not yet consulted by any lever (§7 "War Footing" is deferred) — exposed for that future lever to check against. */
const PEACETIME_TOLERANCE_FLOOR = 0.6;
const WARTIME_TOLERANCE_FLOOR = 0.9;

/**
 * §4.2 — structural adjustment to the raw per-form Marshalcy baseline (§3): a vassal's or a
 * Union's "normal, uncut" military budget is already lower than a sovereign Monarchy's,
 * independent of any deliberate policy cut. Always applied to allocateTreasury()'s Marshalcy
 * Budget, unlike getMilitaryFundingCeiling()'s tolerance floor below.
 */
export function getMilitaryStructuralMultiplier(state: Pick<State, "form" | "diplomacy">): number {
  let multiplier = 1;
  if (isVassalState(state)) multiplier *= VASSAL_STRUCTURAL_MULTIPLIER;
  if (state.form === "Union") multiplier *= UNION_STRUCTURAL_MULTIPLIER;
  return multiplier;
}

/**
 * §4.2 — the floor (as a fraction of the raw per-form Marshalcy baseline, §3) a future
 * allocation lever must respect before a deliberate cut risks extra political backlash on top
 * of ordinary funding-ratio discontent (§4.3). No lever exists yet to act on this value
 * (docs/plan/state-treasury-department-budget.md §7's "War Footing" item) — exposed now so that
 * lever can consult it without another schema round-trip.
 */
export function getMilitaryFundingCeiling(state: State): number {
  const toleranceFloor = stateHasEnemy(state) ? WARTIME_TOLERANCE_FLOOR : PEACETIME_TOLERANCE_FLOOR;
  return rn(getMilitaryStructuralMultiplier(state) * toleranceFloor, 3);
}

const MILITARY_DISCONTENT_MAX = 200;
const MILITARY_DISCONTENT_EVENT_THRESHOLD = 100;
const MILITARY_DISCONTENT_DECAY_PER_CYCLE = 5;
const MILITARY_DISCONTENT_WEAK_GAIN_PER_CYCLE = 3;
const MILITARY_DISCONTENT_STRONG_GAIN_PER_CYCLE = 10;
/** §4.3 funding-ratio tiers. */
const WELL_FUNDED_RATIO = 0.8;
const UNDERFUNDED_RATIO = 0.5;

/**
 * §4.3 — accumulates/decays state.militaryDiscontent from the Marshalcy funding ratio each
 * cycle, and edge-triggers "fmg:military-discontent-threshold" exactly once per upward
 * crossing (not every cycle while sustained above it). What happens when the event fires is
 * explicitly deferred (§4.3, §8 non-goals) — no listener exists yet.
 */
function updateMilitaryDiscontent(state: State, fundingRatio: number): void {
  const previous = state.militaryDiscontent || 0;
  const next =
    fundingRatio >= WELL_FUNDED_RATIO
      ? Math.max(0, previous - MILITARY_DISCONTENT_DECAY_PER_CYCLE)
      : Math.min(
          MILITARY_DISCONTENT_MAX,
          previous +
            (fundingRatio >= UNDERFUNDED_RATIO
              ? MILITARY_DISCONTENT_WEAK_GAIN_PER_CYCLE
              : MILITARY_DISCONTENT_STRONG_GAIN_PER_CYCLE)
        );

  state.militaryDiscontent = rn(next, 2);

  if (previous < MILITARY_DISCONTENT_EVENT_THRESHOLD && next >= MILITARY_DISCONTENT_EVENT_THRESHOLD) {
    document.dispatchEvent(
      new CustomEvent("fmg:military-discontent-threshold", { detail: { stateId: state.i, discontent: next } })
    );
  }
}

/**
 * Pays this cycle's household stipend to the state's ruler and returns the amount to
 * deduct from domestic income — same call shape as getStateMilitaryUpkeep(), so
 * collectTaxes() folds both into one treasury update. If no living ruler is on file
 * (Characters/Nobility disabled, or between successions), the stipend is skipped and the
 * income stays banked in state.treasury instead of disappearing. getRulerId() already
 * degrades to `undefined` when Nobility is inactive; hasCharactersContext() covers the
 * independent case of Characters being disabled while Nobility still holds a stale
 * rulerId, since getCharacters() throws without an initialized Characters context.
 */
export function payRulerHouseholdStipend(state: State, domesticIncome: number): number {
  if (!(domesticIncome > 0) || !hasCharactersContext()) return 0;

  const rulerId = getRulerId(state);
  if (rulerId === undefined) return 0;
  const ruler = getCharacters().find(character => character.i === rulerId && !character.dead);
  if (!ruler) return 0;

  const stipend = rn(domesticIncome * getHouseholdStipendRate(state), 2);
  if (stipend <= 0) return 0;

  ruler.wealth = rn((ruler.wealth || 0) + stipend, 2);
  return stipend;
}

export interface TreasuryAllocationBreakdown {
  /** Real deduction — paid to the ruler's Character.wealth (§5), same figure payRulerHouseholdStipend() returns. */
  household: number;
  /** Policy "Budget" (§4.1) — informational only. The existing getStateMilitaryUpkeep() "Need" deduction is unchanged; this does not double-deduct. */
  marshalcy: number;
  /** Informational — no wired game effect yet (§8 non-goal), not deducted from state.treasury. */
  chancery: number;
  stewardship: number;
  spymastery: number;
  ecclesiastica: number;
  /** Marshalcy Budget ÷ Need, mirrors state.militaryFundingRatio after this call. */
  militaryFundingRatio: number;
}

/**
 * §7 item 3 — this cycle's full department breakdown (§3 baseline × domestic income) plus the
 * Marshalcy funding-ratio/discontent update (§4). Only `household` (a real Character.wealth
 * transfer) and the pre-existing getStateMilitaryUpkeep() upkeep charge actually move
 * state.treasury today — Chancery/Stewardship/Spymastery/Ecclesiastica have no game effect
 * wired yet, so deducting their share would just be an unexplained sink; callers should treat
 * those four as read-only figures for now (future UI / future effect wiring).
 */
export function allocateTreasury(state: State, domesticIncome: number): TreasuryAllocationBreakdown {
  const income = Math.max(0, domesticIncome);
  const baseline = getDepartmentBaselineAllocation(state);

  const marshalcyBudget = rn(income * baseline.marshalcy * getMilitaryStructuralMultiplier(state), 2);
  const need = getStateMilitaryUpkeep(state);
  const fundingRatio = need > 0 ? rn(marshalcyBudget / need, 3) : 1;

  state.militaryFundingRatio = fundingRatio;
  updateMilitaryDiscontent(state, fundingRatio);

  return {
    household: payRulerHouseholdStipend(state, income),
    marshalcy: marshalcyBudget,
    chancery: rn(income * baseline.chancery, 2),
    stewardship: rn(income * baseline.stewardship, 2),
    spymastery: rn(income * baseline.spymastery, 2),
    ecclesiastica: rn(income * baseline.ecclesiastica, 2),
    militaryFundingRatio: fundingRatio
  };
}
