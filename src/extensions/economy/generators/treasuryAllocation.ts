import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { stateHasEnemy } from "../../hostCore";
import type { MilitaryRegiment, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { CENTRAL_OFFICES } from "../../nobility/data/titleTable";
import { getRegimentCommander } from "../../nobility/generators/officerAssignment";
import { getRulerId } from "../../nobility/nobilityContext";
import { getRegimentMilitaryUpkeep, getStateMilitaryUpkeep } from "./militaryLogistics";

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
 * Personal household pay uses the form's baseline *share* of domestic income as a soft target,
 * then clamps to a floor/cap so large states do not mint multi-hundred-gold private purses every
 * cycle. Multi-ledger PR-2: the form's full household *share* credits L1 `householdPurse` from
 * L2; only this capped personal stipend moves L1 → ruler L0.
 *
 * Scale target (silver pieces / production cycle, ~12 cycles/year):
 *   soldier wage ≈ 0.12, field commander 0.5–1.5, province lord ≈ 1, office 0.8–3, ruler 1–5.
 */
export const HOUSEHOLD_STIPEND_FLOOR = 1.0;
export const HOUSEHOLD_STIPEND_CAP = 5.0;

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
 * The rest of the department line stays in state.treasury for institutional spending — paying
 * 100% of Marshalcy/Chancery/etc. into Character.wealth made officers richer than rulers of
 * small realms and drained state cash every cycle.
 */
export const CENTRAL_OFFICE_PERSONAL_SHARE = 0.12;
export const CENTRAL_OFFICE_STIPEND_FLOOR = 0.8;
export const CENTRAL_OFFICE_STIPEND_CAP = 3.0;

/** Personal pay for one central office from its department's nominal budget this cycle. */
export function getCentralOfficePersonalStipend(departmentBudget: number): number {
  if (!(departmentBudget > 0)) return 0;
  const proportional = departmentBudget * CENTRAL_OFFICE_PERSONAL_SHARE;
  const floored = Math.max(proportional, Math.min(CENTRAL_OFFICE_STIPEND_FLOOR, departmentBudget));
  return rn(Math.min(floored, CENTRAL_OFFICE_STIPEND_CAP, departmentBudget), 2);
}

/**
 * Pays each of the 5 CENTRAL_OFFICES (Chancellor/Marshal/Steward/Spymaster/Court Chaplain,
 * titleTable.ts) a *personal* stipend derived from its department's nominal Budget — share +
 * floor/cap, not the full Budget. Nominal department figures on `breakdown` stay intact for
 * militaryFundingRatio/§4 ceiling comparisons and Treasury Overview. Vacant offices pay 0;
 * their share remains in state.treasury.
 */
export function payCentralOfficeStipends(state: Pick<State, "i">, breakdown: TreasuryAllocationBreakdown): number {
  if (!state.i || !hasCharactersContext()) return 0;
  const characters = getCharacters();

  let totalPaid = 0;
  for (const office of CENTRAL_OFFICES) {
    const departmentKey = office.primarySkill && DEPARTMENT_BY_PRIMARY_SKILL[office.primarySkill];
    if (!departmentKey) continue;
    const amount = getCentralOfficePersonalStipend(breakdown[departmentKey]);
    if (!(amount > 0)) continue;

    const holder = findLivingOfficeHolder(characters, state.i, office.title);
    if (!holder) continue;

    holder.wealth = rn((holder.wealth || 0) + amount, 2);
    totalPaid = rn(totalPaid + amount, 2);
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
 * the regiment's raw-score upkeep is after populationRate scaling. Roughly 4× a common
 * soldier's monthly wage (BASE_UPKEEP_PER_HEAD = 0.12).
 */
export const FIELD_COMMANDER_STIPEND_FLOOR = 0.5;

/**
 * Maximum personal command pay per cycle so huge regiments do not pay captains like princes.
 * ~1.5 SP × 12 cycles ≈ 18 SP/year held income — sits above guild masters, below central offices.
 */
export const FIELD_COMMANDER_STIPEND_CAP = 1.5;

/**
 * Per-cycle stipend for a field/fleet officer: clamp(upkeep × rate, floor, cap).
 * Used by payFieldCommanderStipends and seedMissingCharacterWealth.
 */
export function getFieldCommanderStipend(regiment: Pick<MilitaryRegiment, "u">): number {
  const proportional = getRegimentMilitaryUpkeep(regiment) * FIELD_COMMANDER_STIPEND_RATE;
  return rn(Math.min(Math.max(proportional, FIELD_COMMANDER_STIPEND_FLOOR), FIELD_COMMANDER_STIPEND_CAP), 2);
}

/**
 * Pays each living field/fleet officer (Commander/Admiral) commanding one of `state.military`'s
 * non-capital-guard regiments a stipend off that regiment's own upkeep cost (see
 * FIELD_COMMANDER_STIPEND_RATE / FLOOR). Returns the total actually paid — a real deduction from
 * state.treasury, folded into TreasuryAllocationBreakdown.fieldCommanderStipendsPaid alongside
 * officeStipendsPaid. A regiment with no dedicated officer yet (assignOfficers() only sparsely
 * assigns them) or a dead one simply pays nothing for that regiment.
 */
export function payFieldCommanderStipends(state: Pick<State, "i" | "military">): number {
  if (!state.i || !hasCharactersContext()) return 0;
  const characters = getCharacters();

  let totalPaid = 0;
  for (const regiment of state.military || []) {
    if (regiment.isCapitalGuard) continue;

    const commander = getRegimentCommander(characters, regiment);
    if (!commander) continue;

    const amount = getFieldCommanderStipend(regiment);
    if (!(amount > 0)) continue;

    commander.wealth = rn((commander.wealth || 0) + amount, 2);
    totalPaid = rn(totalPaid + amount, 2);
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
  /** Real deduction — sum of §2's CENTRAL_OFFICES stipends actually paid this cycle (payCentralOfficeStipends()); 0 for any vacant office, whose share stays in state.treasury instead of disappearing. */
  officeStipendsPaid: number;
  /** Real deduction — sum of field/fleet officer command-pay stipends actually paid this cycle (payFieldCommanderStipends()); 0 for any regiment with no living dedicated officer. */
  fieldCommanderStipendsPaid: number;
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
 * §7 item 3 + multi-ledger PR-2 — department breakdown, funding ratio, household L2→L1 credit,
 * personal L1→L0 stipend, office/field stipends. Caller must have already added this cycle's
 * domestic income to `state.treasury` before calling, so household purse credit can draw on it.
 *
 * L2 deductions applied here: householdPurseCredit (mutates treasury).
 * L2 deductions applied by collectTaxes from the return value: officeStipendsPaid,
 * fieldCommanderStipendsPaid (plus military upkeep / procurement).
 * Personal household pay is not an L2 deduction (comes from L1).
 */
export function allocateTreasury(state: State, domesticIncome: number): TreasuryAllocationBreakdown {
  const income = Math.max(0, domesticIncome);
  const baseline = getDepartmentBaselineAllocation(state);

  const marshalcyBudget = rn(income * baseline.marshalcy * getMilitaryStructuralMultiplier(state), 2);
  const need = getStateMilitaryUpkeep(state);
  const fundingRatio = need > 0 ? rn(marshalcyBudget / need, 3) : 1;

  state.militaryFundingRatio = fundingRatio;
  updateMilitaryDiscontent(state, fundingRatio);

  const householdNominal = getHouseholdNominalBudget(state, income);
  const householdPurseCredit = creditHouseholdPurse(state, income);
  const household = payRulerHouseholdStipend(state, income);

  const breakdown: TreasuryAllocationBreakdown = {
    household,
    householdPurseCredit,
    householdNominal,
    marshalcy: marshalcyBudget,
    chancery: rn(income * baseline.chancery, 2),
    stewardship: rn(income * baseline.stewardship, 2),
    spymastery: rn(income * baseline.spymastery, 2),
    ecclesiastica: rn(income * baseline.ecclesiastica, 2),
    militaryFundingRatio: fundingRatio,
    officeStipendsPaid: 0,
    fieldCommanderStipendsPaid: 0
  };
  breakdown.officeStipendsPaid = payCentralOfficeStipends(state, breakdown);
  breakdown.fieldCommanderStipendsPaid = payFieldCommanderStipends(state);

  if (state.i) _snapshotByState.set(state.i, { stateId: state.i, domesticIncome: income, ...breakdown });

  return breakdown;
}
