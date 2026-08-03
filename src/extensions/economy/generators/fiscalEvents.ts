import { stateHasEnemy } from "../../hostCore";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { getCouncilSupport, scaleFailureChanceBySupport, updateCouncilSupportSnapshot } from "./councilAssembly";
import { isWarFootingActive } from "./warFooting";

/**
 * Multi-ledger PR-7/PR-8 — thin fiscal events on top of the multi-ledger pipe:
 * council/assembly consent (income haircut, support-scaled in PR-8), tax farming leak,
 * public debt service/issue.
 *
 * Deterministic rolls use state id + income so unit tests stay stable without a seeded RNG.
 */

/** Chance (0–100) that this cycle's council/assembly fails to fully approve ordinary revenue. */
export const COUNCIL_FAILURE_CHANCE_BY_FORM: Record<string, number> = {
  Republic: 18,
  Union: 12,
  Monarchy: 5,
  Theocracy: 3,
  Anarchy: 0
};

/** Income scale applied when council consent fails (partial collection / blocked subsidy). */
export const COUNCIL_FAILURE_INCOME_SCALE = 0.75;

/** Share of this cycle's domestic income skimmed by tax farmers (Monarchy/Republic). */
export const TAX_FARM_RATE_BY_FORM: Record<string, number> = {
  Monarchy: 0.05,
  Republic: 0.08,
  Union: 0.03,
  Theocracy: 0,
  Anarchy: 0
};

/** Annualized-style monthly interest on publicDebt principal. */
export const PUBLIC_DEBT_INTEREST_RATE = 0.02;

/** Max principal a state may hold as thin war debt. */
export const PUBLIC_DEBT_CAP = 200;

/** Borrow size when war footing and L2 is cash-strapped. */
export const WAR_DEBT_ISSUE_AMOUNT = 25;

/** Issue debt only when L2 is at or below this after prior credits. */
export const WAR_DEBT_CASH_THRESHOLD = 5;

export interface FiscalEventsResult {
  /** Multiplier applied to domestic income used for allocateTreasury (1 or council failure scale). */
  incomeScale: number;
  councilFailed: boolean;
  /** PR-8 assembly support snapshot used for this cycle's veto roll (0–100). */
  councilSupport: number;
  /** Effective wartime veto chance after support scaling (0–100). */
  councilFailChance: number;
  taxFarmLeak: number;
  debtInterestPaid: number;
  debtIssued: number;
  debtRepaid: number;
}

/** Stable 0–99 roll from state id + income (no RNG stream dependency). */
export function fiscalEventRoll(stateId: number, domesticIncome: number): number {
  const x = Math.abs(Math.floor(stateId * 17 + domesticIncome * 100));
  return x % 100;
}

export function getCouncilFailureChance(form: string | undefined): number {
  return COUNCIL_FAILURE_CHANCE_BY_FORM[form || ""] ?? COUNCIL_FAILURE_CHANCE_BY_FORM.Monarchy;
}

export function getTaxFarmRate(form: string | undefined): number {
  return TAX_FARM_RATE_BY_FORM[form || ""] ?? 0;
}

/**
 * Apply PR-7 fiscal events after domestic income is on L2 (and after form revenue mix).
 * May reduce L2 (tax farm, interest, council clawback), credit capital burg (tax farm),
 * or issue/repay publicDebt.
 *
 * Returns `incomeScale` for allocateTreasury: when the council fails, nominal department
 * shares are computed from scaled income so the polity "budgeted less" this cycle.
 */
export function applyFiscalEvents(state: State, domesticIncome: number): FiscalEventsResult {
  const income = Math.max(0, domesticIncome);
  let incomeScale = 1;
  let councilFailed = false;
  let taxFarmLeak = 0;
  let debtInterestPaid = 0;
  let debtIssued = 0;
  let debtRepaid = 0;

  // PR-8: refresh assembly support before any veto roll.
  const councilSupport = updateCouncilSupportSnapshot(state);

  // ── Council / assembly consent (wartime / war-footing extraordinary only) ─
  // Peacetime ordinary revenue is not vetoed — keeps the base tax pipe stable.
  // PR-8: base form chance is scaled by inverse support (strong assemblies veto less often).
  const wartimeAssembly = isWarFootingActive(state) || stateHasEnemy(state);
  const baseFailChance = wartimeAssembly ? getCouncilFailureChance(state.form) : 0;
  const failChance = scaleFailureChanceBySupport(baseFailChance, councilSupport);
  if (failChance > 0 && income > 0 && fiscalEventRoll(state.i || 0, income) < failChance) {
    councilFailed = true;
    incomeScale = COUNCIL_FAILURE_INCOME_SCALE;
    // Claw back the unapproved share from L2 (already fully credited).
    const claw = rn(income * (1 - incomeScale), 2);
    if (claw > 0) {
      state.treasury = rn(Math.max(0, (state.treasury || 0) - claw), 2);
    }
  }
  state.councilLastFailed = councilFailed;

  // ── Tax farming leak (contractor profit → capital burg if any) ──────────
  // PR-8 calibration: high-greed forms already have higher rates; support slightly
  // reduces farming abuse when assemblies are strong (Republic/Union).
  const farmRate = getTaxFarmRate(state.form);
  const farmSupportFactor = state.form === "Republic" || state.form === "Union" ? 1 - (councilSupport - 50) / 400 : 1;
  if (farmRate > 0 && income > 0) {
    const desired = rn(income * farmRate * incomeScale * Math.max(0.5, farmSupportFactor), 2);
    const available = state.treasury || 0;
    taxFarmLeak = rn(Math.min(desired, available), 2);
    if (taxFarmLeak > 0) {
      state.treasury = rn(available - taxFarmLeak, 2);
      creditTaxFarmToCapital(state, taxFarmLeak);
    }
  }
  state.lastTaxFarmLeak = taxFarmLeak;

  // ── Public debt service ─────────────────────────────────────────────────
  const debt = state.publicDebt || 0;
  if (debt > 0) {
    const interest = rn(debt * PUBLIC_DEBT_INTEREST_RATE, 2);
    const cash = state.treasury || 0;
    debtInterestPaid = rn(Math.min(interest, cash), 2);
    if (debtInterestPaid > 0) {
      state.treasury = rn(cash - debtInterestPaid, 2);
    } else if (interest > 0) {
      // Capitalize unpaid interest.
      state.publicDebt = rn(debt + interest, 2);
    }

    // Repay principal from surplus L2 (keep a small buffer).
    const surplus = state.treasury || 0;
    if (surplus > WAR_DEBT_CASH_THRESHOLD && (state.publicDebt || 0) > 0) {
      const repay = rn(Math.min(surplus - WAR_DEBT_CASH_THRESHOLD, state.publicDebt || 0), 2);
      if (repay > 0) {
        state.treasury = rn(surplus - repay, 2);
        state.publicDebt = rn((state.publicDebt || 0) - repay, 2);
        debtRepaid = repay;
      }
    }
  }

  // ── Thin war debt issue ─────────────────────────────────────────────────
  // PR-8: still auto-issues when cash-strapped at war, but only if support is not abysmal.
  if (
    isWarFootingActive(state) &&
    stateHasEnemy(state) &&
    (state.form === "Republic" || state.form === "Monarchy") &&
    (state.treasury || 0) <= WAR_DEBT_CASH_THRESHOLD &&
    (state.publicDebt || 0) < PUBLIC_DEBT_CAP &&
    councilSupport >= 30
  ) {
    const room = rn(PUBLIC_DEBT_CAP - (state.publicDebt || 0), 2);
    debtIssued = rn(Math.min(WAR_DEBT_ISSUE_AMOUNT, room), 2);
    if (debtIssued > 0) {
      state.publicDebt = rn((state.publicDebt || 0) + debtIssued, 2);
      state.treasury = rn((state.treasury || 0) + debtIssued, 2);
    }
  }

  state.lastDebtIssued = debtIssued;
  state.lastDebtRepaid = debtRepaid;

  return {
    incomeScale,
    councilFailed,
    councilSupport,
    councilFailChance: failChance,
    taxFarmLeak,
    debtInterestPaid,
    debtIssued,
    debtRepaid
  };
}

function creditTaxFarmToCapital(state: State, amount: number): void {
  if (!(amount > 0) || !state.capital) return;
  try {
    const { pack } = getWorldContext();
    const burg = pack.burgs?.[state.capital];
    if (!burg || burg.removed) return;
    burg.treasury = rn((burg.treasury || 0) + amount, 2);
  } catch {
    // Economy context missing in pure unit tests — leak still left L2 (contractor profit absorbed).
  }
}
