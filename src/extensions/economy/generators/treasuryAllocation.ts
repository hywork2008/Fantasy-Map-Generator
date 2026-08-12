import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { stateHasEnemy } from "../../hostCore";
import type { MilitaryRegiment, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { CENTRAL_OFFICES } from "../../nobility/data/titleTable";
import { getRegimentCommander } from "../../nobility/generators/officerAssignment";
import { getRulerId } from "../../nobility/nobilityContext";
import type { DepartmentBaselineAllocation } from "./departmentAllocationTypes";
import { getRegimentMilitaryUpkeep, getStateMilitaryUpkeep } from "./militaryLogistics";
import { applyWarFootingToBaseline, updateMilitaryMobilizationBoost } from "./warFooting";

export type { DepartmentBaselineAllocation } from "./departmentAllocationTypes";

/** Max absolute share points ruler greed can add to household (PR-7 personality). */
export const PERSONALITY_HOUSEHOLD_GREED_SHIFT = 0.04;
/** Max absolute share points ruler boldness can add to marshalcy (PR-7 personality). */
export const PERSONALITY_MARSHALCY_BOLDNESS_SHIFT = 0.05;

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

/**
 * PR-7 — thin ruler-personality shift on department shares before war footing.
 * High greed → slightly more household; high boldness → slightly more marshalcy.
 * Renormalizes to sum 1. No-op without Characters / vacant throne.
 */
export function applyRulerPersonalityToBaseline(
  baseline: DepartmentBaselineAllocation,
  state: Pick<State, "i" | "form">
): DepartmentBaselineAllocation {
  if (!state.i || !hasCharactersContext()) return { ...baseline };

  const rulerId = getRulerId(state as State);
  if (rulerId === undefined) return { ...baseline };
  const ruler = getCharacters().find(c => c.i === rulerId && !c.dead);
  if (!ruler?.personality) return { ...baseline };

  const greed = ruler.personality.greed ?? 50;
  const boldness = ruler.personality.boldness ?? 50;
  // Map 0..100 → -shift..+shift around neutral 50.
  const greedDelta = ((greed - 50) / 50) * PERSONALITY_HOUSEHOLD_GREED_SHIFT;
  const boldDelta = ((boldness - 50) / 50) * PERSONALITY_MARSHALCY_BOLDNESS_SHIFT;

  const next: DepartmentBaselineAllocation = { ...baseline };
  next.household = Math.max(0, next.household + greedDelta);
  next.marshalcy = Math.max(0, next.marshalcy + boldDelta);

  // Pull the opposite of each delta from the largest other non-target pools.
  const absorb = -greedDelta - boldDelta;
  if (Math.abs(absorb) > 0.0001) {
    const donors: (keyof DepartmentBaselineAllocation)[] = ["chancery", "stewardship", "spymastery", "ecclesiastica"];
    let donorSum = 0;
    for (const key of donors) donorSum += next[key];
    if (donorSum > 0) {
      for (const key of donors) {
        next[key] = Math.max(0, next[key] + absorb * (next[key] / donorSum));
      }
    }
  }

  const keys: (keyof DepartmentBaselineAllocation)[] = [
    "marshalcy",
    "household",
    "chancery",
    "stewardship",
    "spymastery",
    "ecclesiastica"
  ];
  let sum = 0;
  for (const key of keys) sum += next[key];
  if (sum > 0) {
    for (const key of keys) next[key] = rn(next[key] / sum, 4);
    let again = 0;
    for (const key of keys) again += next[key];
    next.marshalcy = rn(next.marshalcy + (1 - again), 4);
  }
  return next;
}

export function getHouseholdStipendRate(state: Pick<State, "form">): number {
  return getDepartmentBaselineAllocation(state).household;
}

/** Player-adjustable multiplier range for a non-marshalcy department's share (PR-17c). */
export const DEPARTMENT_BUDGET_MULTIPLIER_MIN = 0.5;
export const DEPARTMENT_BUDGET_MULTIPLIER_MAX = 1.5;

export function clampDepartmentBudgetMultiplier(value: number): number {
  return Math.max(DEPARTMENT_BUDGET_MULTIPLIER_MIN, Math.min(DEPARTMENT_BUDGET_MULTIPLIER_MAX, value));
}

/**
 * PR-17c (docs/plan/department-budget-spending-effects.md §4) — apply the player's per-department
 * override multiplier on top of the form+personality+war-footing baseline. Only
 * Chancery/Stewardship/Spymastery/Ecclesiastica are adjustable — Marshalcy already has War
 * Footing as its policy lever, and Household is the ruler's personal/court budget with its own
 * texture (characterLivingCosts.ts), not a "department" in this sense.
 *
 * Deliberately NOT renormalized back to sum 1 — unlike the personality/war-footing reweighting
 * above it, a player cut's freed share is not redistributed to other departments. It simply goes
 * unallocated, so `state.treasury` genuinely retains more cash this cycle (visible next cycle as
 * a lower departmentServiceLevel for the cut department via PR-17b). That is the entire point of
 * the lever: trade a department's service level for real treasury savings, not a bigger slice
 * elsewhere. A multiplier above 1 mainly fills that department's L3a balance faster and hits
 * PR-17a's cap (and remits back to L2) sooner — departmentServiceLevel itself is clamped to 1,
 * so over-funding does not raise it past "fully funded."
 *
 * PR-17f: a genuine cut (multiplier < 1) additionally needs its council budget line approved
 * (docs/plan/department-budget-spending-effects.md §4) — see isDepartmentCutApproved(). A boost
 * (multiplier ≥ 1) never needs approval; only spending less is politically contestable.
 */
export function applyDepartmentBudgetOverride(
  baseline: DepartmentBaselineAllocation,
  state: Pick<State, "departmentBudgetMultiplier" | "councilApprovals">
): DepartmentBaselineAllocation {
  const multipliers = state.departmentBudgetMultiplier;
  if (!multipliers) return { ...baseline };

  const next: DepartmentBaselineAllocation = { ...baseline };
  for (const key of NON_MARSHALCY_DEPARTMENT_KEYS) {
    const raw = multipliers[key];
    if (raw === undefined) continue;
    const clamped = clampDepartmentBudgetMultiplier(raw);
    if (clamped < 1 && !isDepartmentCutApproved(state, key)) continue;
    next[key] = rn(Math.max(0, next[key] * clamped), 4);
  }
  return next;
}

/**
 * PR-17f — whether the assembly currently approves a cut to this department's budget.
 * Reads the persisted per-cycle snapshot (`state.councilApprovals`, refreshed by
 * councilBudget.ts's refreshCouncilBudgetApprovals() inside every collectTaxes() cycle via
 * fiscalEvents.ts, which always runs before allocateTreasury()). Missing snapshot (e.g. Economy
 * has never run a full tax cycle yet, or a test calls allocateTreasury() in isolation) defaults
 * to permissive — pre-PR-17f behavior — rather than recomputing live like isCouncilLineApproved()
 * does for user-initiated actions: a standing budget policy should reflect the last settled
 * political mood, not force a fresh (and here, unnecessary) vote simulation on every read.
 */
function isDepartmentCutApproved(state: Pick<State, "councilApprovals">, key: NonMarshalcyDepartmentKey): boolean {
  const approvals = state.councilApprovals;
  if (!approvals) return true;
  switch (key) {
    case "chancery":
      return approvals.cutChancery;
    case "stewardship":
      return approvals.cutStewardship;
    case "spymastery":
      return approvals.cutSpymastery;
    case "ecclesiastica":
      return approvals.cutEcclesiastica;
    default:
      return true;
  }
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
 * Personal household pay uses the form's baseline *share* of domestic income as a soft target,
 * then clamps to a floor/cap so large states do not mint multi-hundred-gold private purses every
 * cycle. Multi-ledger PR-2: the form's full household *share* credits L1 `householdPurse` from
 * L2; only this capped personal stipend moves L1 → ruler L0.
 *
 * Scale target (silver pieces / production cycle, ~12 cycles/year; ×3-rescaled 2026-08-06, see
 * characterStipends.ts's ladder doc comment):
 *   soldier wage ≈ 0.12 (unscaled), field commander 1.5–4.5, province lord ≈ 3, office 2.4–9,
 *   ruler 3–15.
 */
export const HOUSEHOLD_STIPEND_FLOOR = 3.0;
export const HOUSEHOLD_STIPEND_CAP = 15.0;

/** Full household budget intent this cycle (form % × domestic income) — funds L1, not L0. */
export function getHouseholdNominalBudget(state: Pick<State, "form">, domesticIncome: number): number {
  if (!(domesticIncome > 0)) return 0;
  return rn(domesticIncome * getHouseholdStipendRate(state), 2);
}

/** Personal pay for a ruler this cycle from `domesticIncome` (after floor/cap). */
export function getRulerHouseholdStipend(state: Pick<State, "form">, domesticIncome: number): number {
  if (!(domesticIncome > 0)) return 0;
  const raw = getHouseholdNominalBudget(state, domesticIncome);
  const floored = Math.max(raw, Math.min(HOUSEHOLD_STIPEND_FLOOR, domesticIncome));
  return rn(Math.min(floored, HOUSEHOLD_STIPEND_CAP, domesticIncome), 2);
}

/**
 * Move up to the nominal household share from L2 public treasury into L1 household purse.
 * Caller must credit this cycle's domestic income onto `state.treasury` first.
 * Returns the amount actually moved (0 if the public purse is empty).
 */
export function creditHouseholdPurse(state: State, domesticIncome: number): number {
  const desired = getHouseholdNominalBudget(state, domesticIncome);
  if (!(desired > 0)) return 0;

  const available = state.treasury || 0;
  const moved = rn(Math.min(desired, available), 2);
  if (!(moved > 0)) return 0;

  state.treasury = rn(available - moved, 2);
  state.householdPurse = rn((state.householdPurse || 0) + moved, 2);
  return moved;
}

/**
 * Pays the living ruler a personal stipend from L1 `householdPurse` (not from L2).
 * Returns the amount paid into Character.wealth. Vacant throne / no Characters → 0; cash stays in L1.
 */
export function payRulerHouseholdStipend(state: State, domesticIncome: number): number {
  if (!(domesticIncome > 0) || !hasCharactersContext()) return 0;

  const rulerId = getRulerId(state);
  if (rulerId === undefined) return 0;
  const ruler = getCharacters().find(character => character.i === rulerId && !character.dead);
  if (!ruler) return 0;

  const desired = getRulerHouseholdStipend(state, domesticIncome);
  const purse = state.householdPurse || 0;
  const paid = rn(Math.min(desired, purse), 2);
  if (!(paid > 0)) return 0;

  state.householdPurse = rn(purse - paid, 2);
  ruler.wealth = rn((ruler.wealth || 0) + paid, 2);
  return paid;
}

/** §2 maps each CENTRAL_OFFICES primarySkill onto the department its office holder is paid from. */
export const DEPARTMENT_BY_PRIMARY_SKILL: Record<
  string,
  keyof Pick<DepartmentBaselineAllocation, "marshalcy" | "chancery" | "stewardship" | "spymastery" | "ecclesiastica">
> = {
  diplomacy: "chancery",
  martial: "marshalcy",
  stewardship: "stewardship",
  intrigue: "spymastery",
  learning: "ecclesiastica"
};

export function findLivingOfficeHolder(characters: Character[], stateId: number, title: string): Character | undefined {
  return characters.find(
    character =>
      !character.dead &&
      character.titles.some(
        holding => holding.entityType === "state" && holding.entityId === stateId && holding.title === title
      )
  );
}

/**
 * Fraction of a department's *nominal* Budget paid as the office holder's personal stipend.
 * The institutional remainder stays in L3a `departmentBalances` (PR-3).
 */
export const CENTRAL_OFFICE_PERSONAL_SHARE = 0.12;
/** ×3-rescaled 2026-08-06 (characterStipends.ts's ladder doc comment). */
export const CENTRAL_OFFICE_STIPEND_FLOOR = 2.4;
export const CENTRAL_OFFICE_STIPEND_CAP = 9.0;

export type DepartmentBalanceKey = keyof Pick<
  DepartmentBaselineAllocation,
  "marshalcy" | "chancery" | "stewardship" | "spymastery" | "ecclesiastica"
>;

export type DepartmentBalances = Record<DepartmentBalanceKey, number>;

export const DEPARTMENT_BALANCE_KEYS: readonly DepartmentBalanceKey[] = [
  "marshalcy",
  "chancery",
  "stewardship",
  "spymastery",
  "ecclesiastica"
] as const;

export function emptyDepartmentBalances(): DepartmentBalances {
  return { marshalcy: 0, chancery: 0, stewardship: 0, spymastery: 0, ecclesiastica: 0 };
}

/** Ensure `state.departmentBalances` exists (mutates state). */
export function ensureDepartmentBalances(state: State): DepartmentBalances {
  if (!state.departmentBalances) {
    state.departmentBalances = emptyDepartmentBalances();
  } else {
    for (const key of DEPARTMENT_BALANCE_KEYS) {
      if (state.departmentBalances[key] === undefined) state.departmentBalances[key] = 0;
    }
  }
  return state.departmentBalances;
}

export function sumDepartmentBalances(balances: DepartmentBalances | undefined): number {
  if (!balances) return 0;
  let total = 0;
  for (const key of DEPARTMENT_BALANCE_KEYS) total += balances[key] || 0;
  return rn(total, 2);
}

/** Personal pay for one central office from its department's nominal budget this cycle. */
export function getCentralOfficePersonalStipend(departmentBudget: number): number {
  if (!(departmentBudget > 0)) return 0;
  const proportional = departmentBudget * CENTRAL_OFFICE_PERSONAL_SHARE;
  const floored = Math.max(proportional, Math.min(CENTRAL_OFFICE_STIPEND_FLOOR, departmentBudget));
  return rn(Math.min(floored, CENTRAL_OFFICE_STIPEND_CAP, departmentBudget), 2);
}

/**
 * Move this cycle's nominal department shares from L2 into L3a balances (pro-rata if L2 is short).
 * Returns total cash moved. Caller must credit domestic income to L2 and run household L2→L1 first.
 */
export function creditDepartmentBalances(state: State, nominal: DepartmentBalances): number {
  let desiredTotal = 0;
  for (const key of DEPARTMENT_BALANCE_KEYS) desiredTotal += Math.max(0, nominal[key] || 0);
  desiredTotal = rn(desiredTotal, 2);
  if (!(desiredTotal > 0)) return 0;

  const available = state.treasury || 0;
  if (!(available > 0)) return 0;

  const scale = available >= desiredTotal ? 1 : available / desiredTotal;
  const balances = ensureDepartmentBalances(state);
  let moved = 0;
  for (const key of DEPARTMENT_BALANCE_KEYS) {
    const share = rn(Math.max(0, nominal[key] || 0) * scale, 2);
    if (!(share > 0)) continue;
    balances[key] = rn((balances[key] || 0) + share, 2);
    moved = rn(moved + share, 2);
  }
  // Absorb rare rounding overshoot into marshalcy (largest typical share).
  if (moved > available) {
    const excess = rn(moved - available, 2);
    balances.marshalcy = rn(Math.max(0, (balances.marshalcy || 0) - excess), 2);
    moved = available;
  }
  state.treasury = rn(available - moved, 2);
  return moved;
}

/** The 4 departments PR-17a's balance cap and PR-17b's service level apply to (Marshalcy excluded). */
export type NonMarshalcyDepartmentKey = Exclude<DepartmentBalanceKey, "marshalcy">;

export const NON_MARSHALCY_DEPARTMENT_KEYS: readonly NonMarshalcyDepartmentKey[] = [
  "chancery",
  "stewardship",
  "spymastery",
  "ecclesiastica"
] as const;

/**
 * PR-17a (docs/plan/department-budget-spending-effects.md §6) — non-marshalcy department
 * balances (Chancery/Stewardship/Spymastery/Ecclesiastica) have no spending sink beyond
 * payCentralOfficeStipends' 12% personal-stipend share, so without a cap they accumulate
 * forever with zero further gameplay effect. Marshalcy is deliberately exempt: it is actively
 * drawn down every cycle by troop upkeep and field-commander pay (payMilitaryUpkeep /
 * payFieldCommanderStipends), so an unbounded balance there is a real war chest, not dead
 * weight.
 */
export const DEPARTMENT_BALANCE_CAP_CYCLES = 6;

/**
 * Caps each non-marshalcy department balance at this cycle's nominal budget × CAP_CYCLES,
 * remitting any excess back to L2 `state.treasury` — framed as "the office cannot spend faster
 * than this," not a penalty; the cash is never destroyed. Skips a department whose nominal
 * budget this cycle is 0 (no income to anchor the cap to) rather than stripping an existing
 * balance down to nothing. Returns the total amount remitted.
 */
export function capDepartmentBalances(state: State, nominal: DepartmentBalances): number {
  const balances = ensureDepartmentBalances(state);
  let remitted = 0;
  for (const key of NON_MARSHALCY_DEPARTMENT_KEYS) {
    const nominalBudget = nominal[key] || 0;
    if (!(nominalBudget > 0)) continue;
    const cap = rn(nominalBudget * DEPARTMENT_BALANCE_CAP_CYCLES, 2);
    const current = balances[key] || 0;
    if (current <= cap) continue;
    const excess = rn(current - cap, 2);
    balances[key] = cap;
    remitted = rn(remitted + excess, 2);
  }
  if (remitted > 0) {
    state.treasury = rn((state.treasury || 0) + remitted, 2);
  }
  return remitted;
}

/**
 * PR-17b (docs/plan/department-budget-spending-effects.md §3.1) — non-marshalcy service level:
 * a 0..1 gauge of how well-funded Chancery/Stewardship/Spymastery/Ecclesiastica have *been*
 * recently. Unlike Marshalcy, these departments have no objective "Need" to compare against, so
 * the reference is liquidity itself — how much of this cycle's intended department spend the
 * treasury could actually afford (creditDepartmentBalances' pro-rata scale, shared across all
 * non-marshalcy departments since that scale is applied uniformly). 1 = fully funded, 0 = the
 * treasury could not afford any of it. Unset (old saves, or a state that has never run
 * allocateTreasury) reads as 1 (healthy) via ensureDepartmentServiceLevel.
 */
export type DepartmentServiceLevel = Record<NonMarshalcyDepartmentKey, number>;

export function emptyDepartmentServiceLevel(): DepartmentServiceLevel {
  return { chancery: 1, stewardship: 1, spymastery: 1, ecclesiastica: 1 };
}

/** Ensure `state.departmentServiceLevel` exists, defaulting missing keys to 1 (healthy). */
export function ensureDepartmentServiceLevel(state: State): DepartmentServiceLevel {
  if (!state.departmentServiceLevel) {
    state.departmentServiceLevel = emptyDepartmentServiceLevel();
  } else {
    for (const key of NON_MARSHALCY_DEPARTMENT_KEYS) {
      if (state.departmentServiceLevel[key] === undefined) state.departmentServiceLevel[key] = 1;
    }
  }
  return state.departmentServiceLevel;
}

/**
 * How fast departmentServiceLevel tracks this cycle's liquidity scale. Smoothed (EWMA) rather
 * than instantaneous so a single thin cycle (e.g. a one-off war spend) does not immediately tank
 * administrative effectiveness — only sustained underfunding does. Mirrors the accumulate/decay
 * framing already used for militaryDiscontent, at a comparable cadence.
 */
export const DEPARTMENT_SERVICE_LEVEL_SMOOTHING = 0.25;

/**
 * EWMA-updates every non-marshalcy department's service level toward `instantScale` (this
 * cycle's liquidity scale, clamped to 0..1). Called once per allocateTreasury() cycle; downstream
 * consumers (e.g. taxes-generator.ts's Stewardship → administrative-upkeep link) read the
 * smoothed per-key value from `state.departmentServiceLevel`, not this function's return alone.
 */
export function updateDepartmentServiceLevel(state: State, instantScale: number): DepartmentServiceLevel {
  const level = ensureDepartmentServiceLevel(state);
  const clamped = Math.max(0, Math.min(1, instantScale));
  for (const key of NON_MARSHALCY_DEPARTMENT_KEYS) {
    const previous = level[key] ?? 1;
    level[key] = rn(previous + (clamped - previous) * DEPARTMENT_SERVICE_LEVEL_SMOOTHING, 4);
  }
  return level;
}

/**
 * Pays each living central office holder a personal stipend from L3a departmentBalances
 * (not from L2). Vacant offices leave L3a balances parked. Nominal breakdown figures stay
 * for funding-ratio / overview.
 */
export function payCentralOfficeStipends(state: State, breakdown: TreasuryAllocationBreakdown): number {
  if (!state.i || !hasCharactersContext()) return 0;
  const characters = getCharacters();
  const balances = ensureDepartmentBalances(state);

  let totalPaid = 0;
  for (const office of CENTRAL_OFFICES) {
    const departmentKey = office.primarySkill && DEPARTMENT_BY_PRIMARY_SKILL[office.primarySkill];
    if (!departmentKey) continue;
    const desired = getCentralOfficePersonalStipend(breakdown[departmentKey]);
    if (!(desired > 0)) continue;

    const holder = findLivingOfficeHolder(characters, state.i, office.title);
    if (!holder) continue;

    const available = balances[departmentKey] || 0;
    const paid = rn(Math.min(desired, available), 2);
    if (!(paid > 0)) continue;

    balances[departmentKey] = rn(available - paid, 2);
    holder.wealth = rn((holder.wealth || 0) + paid, 2);
    totalPaid = rn(totalPaid + paid, 2);
  }
  return totalPaid;
}

/**
 * Share of a single regiment's own getRegimentMilitaryUpkeep() (militaryLogistics.ts, same
 * per-head formula getStateMilitaryUpkeep()/the Marshalcy funding-ratio "Need" use) paid as
 * personal command pay to that regiment's living field/fleet officer (Commander/Admiral,
 * officerAssignment.ts — never the capital guard, which is led by the Marshal and already paid
 * in full via payCentralOfficeStipends()). Deliberately sourced from the regiment's own upkeep
 * cost rather than from the Marshalcy Budget line, which payCentralOfficeStipends() already
 * transfers 100% of to the Marshal — this is a separate pool so field officers don't compete
 * with the Marshal for the same money.
 */
export const FIELD_COMMANDER_STIPEND_RATE = 0.15;

/**
 * Minimum personal command pay per production cycle (silver pieces), regardless of how small
 * the regiment's raw-score upkeep is after populationRate scaling. Roughly 12× a common
 * soldier's monthly wage (BASE_UPKEEP_PER_HEAD = 0.12, deliberately left unscaled — see
 * characterStipends.ts's ladder doc comment). ×3-rescaled 2026-08-06 (was 0.5).
 */
export const FIELD_COMMANDER_STIPEND_FLOOR = 1.5;

/**
 * Maximum personal command pay per cycle so huge regiments do not pay captains like princes.
 * ~4.5 SP × 12 cycles ≈ 54 SP/year held income — sits above guild masters, below central offices.
 * ×3-rescaled 2026-08-06 (was 1.5).
 */
export const FIELD_COMMANDER_STIPEND_CAP = 4.5;

/**
 * Per-cycle stipend for a field/fleet officer: clamp(upkeep × rate, floor, cap).
 * Used by payFieldCommanderStipends and seedMissingCharacterWealth.
 */
export function getFieldCommanderStipend(regiment: Pick<MilitaryRegiment, "u">): number {
  const proportional = getRegimentMilitaryUpkeep(regiment) * FIELD_COMMANDER_STIPEND_RATE;
  return rn(Math.min(Math.max(proportional, FIELD_COMMANDER_STIPEND_FLOOR), FIELD_COMMANDER_STIPEND_CAP), 2);
}

/**
 * Multi-ledger PR-5 — draw institutional military cash from L3a.marshalcy first, then L2 public
 * treasury. Used for troop upkeep and field-commander personal pay so those costs still settle
 * after PR-3 parks most of the cycle's revenue in department balances (which left L2 too thin
 * for a pure-L2 deduct).
 */
export interface MarshalcySpendResult {
  fromMarshalcy: number;
  fromTreasury: number;
  paid: number;
}

export function drawFromMarshalcyThenTreasury(state: State, amount: number): MarshalcySpendResult {
  const desired = Math.max(0, amount);
  if (!(desired > 0)) return { fromMarshalcy: 0, fromTreasury: 0, paid: 0 };

  const balances = ensureDepartmentBalances(state);
  const marshalcyAvail = Math.max(0, balances.marshalcy || 0);
  const fromMarshalcy = rn(Math.min(desired, marshalcyAvail), 2);
  if (fromMarshalcy > 0) {
    balances.marshalcy = rn(marshalcyAvail - fromMarshalcy, 2);
  }

  const remaining = rn(desired - fromMarshalcy, 2);
  const treasuryAvail = Math.max(0, state.treasury || 0);
  const fromTreasury = rn(Math.min(remaining, treasuryAvail), 2);
  if (fromTreasury > 0) {
    state.treasury = rn(treasuryAvail - fromTreasury, 2);
  }

  return { fromMarshalcy, fromTreasury, paid: rn(fromMarshalcy + fromTreasury, 2) };
}

/**
 * Deduct this cycle's military troop upkeep (getStateMilitaryUpkeep Need) from L3a.marshalcy
 * first, then L2. Returns how much was actually paid (may be less than Need if both purses empty).
 * Multi-ledger PR-5; called from collectTaxes after allocateTreasury.
 */
export function payMilitaryUpkeep(state: State, need?: number): MarshalcySpendResult & { need: number } {
  const upkeepNeed = need ?? getStateMilitaryUpkeep(state);
  const result = drawFromMarshalcyThenTreasury(state, upkeepNeed);
  return { need: upkeepNeed, ...result };
}

/**
 * Pays each living field/fleet officer (Commander/Admiral) commanding one of `state.military`'s
 * non-capital-guard regiments a stipend off that regiment's own upkeep cost (see
 * FIELD_COMMANDER_STIPEND_RATE / FLOOR). Cash is drawn L3a.marshalcy → L2 (PR-5); payment is
 * cash-limited so commanders are not paid from thin air when both purses are empty. Returns the
 * total actually paid. A regiment with no dedicated officer yet or a dead one pays nothing.
 */
export function payFieldCommanderStipends(state: State): number {
  if (!state.i || !hasCharactersContext()) return 0;
  const characters = getCharacters();

  let totalPaid = 0;
  for (const regiment of state.military || []) {
    if (regiment.isCapitalGuard) continue;

    const commander = getRegimentCommander(characters, regiment);
    if (!commander) continue;

    const amount = getFieldCommanderStipend(regiment);
    if (!(amount > 0)) continue;

    const { paid } = drawFromMarshalcyThenTreasury(state, amount);
    if (!(paid > 0)) continue;

    commander.wealth = rn((commander.wealth || 0) + paid, 2);
    totalPaid = rn(totalPaid + paid, 2);
  }
  return totalPaid;
}

export interface TreasuryAllocationBreakdown {
  /**
   * Personal household stipend paid this cycle into the ruler's Character.wealth (L0), drawn from
   * L1 householdPurse — not a direct L2 deduction. See householdPurseCredit for L2→L1.
   */
  household: number;
  /**
   * Cash moved L2 public treasury → L1 householdPurse this cycle (nominal household share of
   * domestic income, limited by available L2). Multi-ledger PR-2.
   */
  householdPurseCredit: number;
  /** Nominal household budget intent (form % × income) before L2 cash limits. */
  householdNominal: number;
  /** Nominal department Budget (§4.1) — unaffected by whether the office is currently staffed; used for militaryFundingRatio/§4.2 ceiling comparisons. See officeStipendsPaid for what actually left state.treasury. */
  marshalcy: number;
  /** Nominal department Budget — see officeStipendsPaid for what actually left state.treasury. */
  chancery: number;
  stewardship: number;
  spymastery: number;
  ecclesiastica: number;
  /** Marshalcy Budget ÷ Need, mirrors state.militaryFundingRatio after this call. */
  militaryFundingRatio: number;
  /**
   * Cash moved L2 → L3a departmentBalances this cycle (sum of nominal dept shares, L2-limited).
   * Multi-ledger PR-3.
   */
  departmentBalancesCredit: number;
  /**
   * PR-17e — per-department breakdown of departmentBalancesCredit (nominal[key] ×
   * deptFundingScale, the same pro-rata scale creditDepartmentBalances applies uniformly to
   * every key). Sums to departmentBalancesCredit (modulo per-key rounding). Lets Fiscal
   * Report/Treasury Overview show which department actually absorbed a liquidity shortfall,
   * instead of only the combined total. docs/plan/department-budget-spending-effects.md §5.
   */
  departmentActualCredit: DepartmentBalances;
  /**
   * Personal office stipends paid this cycle from L3a → Character.wealth (not an L2 deduction).
   * Vacant offices contribute 0; their L3a share stays parked.
   */
  officeStipendsPaid: number;
  /**
   * Field/fleet officer command-pay this cycle, drawn L3a.marshalcy → L2 (PR-5). Cash-limited;
   * may be less than the uncapped stipend sum when both purses are empty.
   */
  fieldCommanderStipendsPaid: number;
  /**
   * PR-17a — cash remitted L3a → L2 this cycle because a non-marshalcy department balance
   * exceeded DEPARTMENT_BALANCE_CAP_CYCLES × its nominal budget. 0 when no department was over
   * cap. See capDepartmentBalances().
   */
  departmentBalanceRemit: number;
  /** PR-17b — smoothed 0..1 service level per non-marshalcy department after this cycle. */
  departmentServiceLevel: DepartmentServiceLevel;
}

export interface TreasuryAllocationSnapshot extends TreasuryAllocationBreakdown {
  stateId: number;
  /** Domestic income this breakdown was computed from (poll tax + voyage income). */
  domesticIncome: number;
}

// Last allocateTreasury() result per state, for the Treasury Overview dialog (docs/plan/state-treasury-department-budget.md
// §7 item "Treasury Overview UI"). Read-only snapshot of what a real collectTaxes() cycle already computed — never
// recomputed on dialog open, since allocateTreasury() has side effects (household stipend payment, discontent update).
const _snapshotByState = new Map<number, TreasuryAllocationSnapshot>();

export function getTreasuryAllocationSnapshots(): TreasuryAllocationSnapshot[] {
  return Array.from(_snapshotByState.values());
}

export function clearTreasuryAllocationSnapshots(): void {
  _snapshotByState.clear();
}

/**
 * §7 item 3 + multi-ledger PR-2/PR-3/PR-5 — department breakdown, funding ratio, household L2→L1,
 * department L2→L3a, personal stipends from L1/L3a, field commanders from marshalcy→L2.
 * Caller must have already added this cycle's domestic income to `state.treasury`.
 *
 * L2 deductions applied here: householdPurseCredit, departmentBalancesCredit, and any
 * field-commander remainder that marshalcy could not cover.
 * Military troop upkeep is paid after this call via payMilitaryUpkeep() in collectTaxes
 * (also marshalcy→L2). Procurement expense remains an L2-only line in collectTaxes.
 */
export function allocateTreasury(state: State, domesticIncome: number): TreasuryAllocationBreakdown {
  const income = Math.max(0, domesticIncome);
  const formBaseline = getDepartmentBaselineAllocation(state);
  // PR-7: ruler personality nudges household/marshalcy before war footing.
  const personalityBaseline = applyRulerPersonalityToBaseline(formBaseline, state);
  // PR-6: war footing reweights department shares before any cash moves.
  const warFootingBaseline = applyWarFootingToBaseline(personalityBaseline, state);
  // PR-17c: player's deliberate per-department cut/boost — NOT renormalized, unlike the two
  // reweighting steps above (see applyDepartmentBudgetOverride's doc comment).
  const baseline = applyDepartmentBudgetOverride(warFootingBaseline, state);

  const marshalcyBudget = rn(income * baseline.marshalcy * getMilitaryStructuralMultiplier(state), 2);
  const need = getStateMilitaryUpkeep(state);
  const fundingRatio = need > 0 ? rn(marshalcyBudget / need, 3) : 1;

  state.militaryFundingRatio = fundingRatio;
  updateMilitaryDiscontent(state, fundingRatio);
  updateMilitaryMobilizationBoost(state, fundingRatio);

  // Household nominal uses war-footing-adjusted household share (not peacetime table alone).
  const householdNominal = rn(income * baseline.household, 2);
  const householdPurseCredit = creditHouseholdPurseFromNominal(state, householdNominal);
  const household = payRulerHouseholdStipend(state, income);

  const chancery = rn(income * baseline.chancery, 2);
  const stewardship = rn(income * baseline.stewardship, 2);
  const spymastery = rn(income * baseline.spymastery, 2);
  const ecclesiastica = rn(income * baseline.ecclesiastica, 2);
  const nominalDepartments: DepartmentBalances = {
    marshalcy: marshalcyBudget,
    chancery,
    stewardship,
    spymastery,
    ecclesiastica
  };
  const departmentBalancesCredit = creditDepartmentBalances(state, nominalDepartments);
  // PR-17b: liquidity scale this cycle (creditDepartmentBalances applies the same pro-rata
  // scale to every key, marshalcy included, when L2 is short) feeds departmentServiceLevel.
  const desiredDeptTotal = rn(marshalcyBudget + chancery + stewardship + spymastery + ecclesiastica, 2);
  const deptFundingScale = desiredDeptTotal > 0 ? Math.min(1, rn(departmentBalancesCredit / desiredDeptTotal, 4)) : 1;
  const departmentServiceLevel = updateDepartmentServiceLevel(state, deptFundingScale);
  const departmentActualCredit: DepartmentBalances = {
    marshalcy: rn(marshalcyBudget * deptFundingScale, 2),
    chancery: rn(chancery * deptFundingScale, 2),
    stewardship: rn(stewardship * deptFundingScale, 2),
    spymastery: rn(spymastery * deptFundingScale, 2),
    ecclesiastica: rn(ecclesiastica * deptFundingScale, 2)
  };

  const breakdown: TreasuryAllocationBreakdown = {
    household,
    householdPurseCredit,
    householdNominal,
    marshalcy: marshalcyBudget,
    chancery,
    stewardship,
    spymastery,
    ecclesiastica,
    militaryFundingRatio: fundingRatio,
    departmentBalancesCredit,
    departmentActualCredit,
    officeStipendsPaid: 0,
    fieldCommanderStipendsPaid: 0,
    departmentBalanceRemit: 0,
    departmentServiceLevel
  };
  breakdown.officeStipendsPaid = payCentralOfficeStipends(state, breakdown);
  breakdown.fieldCommanderStipendsPaid = payFieldCommanderStipends(state);
  // PR-17a: cap non-marshalcy balances after this cycle's stipends, remitting overflow to L2.
  breakdown.departmentBalanceRemit = capDepartmentBalances(state, nominalDepartments);

  if (state.i) _snapshotByState.set(state.i, { stateId: state.i, domesticIncome: income, ...breakdown });

  return breakdown;
}

/**
 * Credit L1 from L2 using an already-resolved nominal household amount (war-footing-adjusted).
 * Mirrors creditHouseholdPurse but without re-reading peacetime form %.
 */
function creditHouseholdPurseFromNominal(state: State, desired: number): number {
  if (!(desired > 0)) return 0;
  const available = state.treasury || 0;
  const moved = rn(Math.min(desired, available), 2);
  if (!(moved > 0)) return 0;
  state.treasury = rn(available - moved, 2);
  state.householdPurse = rn((state.householdPurse || 0) + moved, 2);
  return moved;
}
