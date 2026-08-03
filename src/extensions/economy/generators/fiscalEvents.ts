import { stateHasEnemy } from "../../hostCore";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { refreshCreditRatingAndBondPrices, runBondSecondaryMarket } from "./bondMarket";
import { scaleFailureChanceBySupport, updateCouncilSupportSnapshot } from "./councilAssembly";
import { refreshCouncilBudgetApprovals } from "./councilBudget";
import { formatFactionVoteSummary, recordCouncilSession } from "./councilSession";
import { captureCouncilSessionSnapshot } from "./councilSessionReplay";
import { tickCoupLegitimacyAndUnrest } from "./coupAftermath";
import { lendFromCreditPool, payCreditorsWithSyndicate, routeTaxFarmProceeds } from "./creditPool";
import { tryDebtCoup } from "./debtCoup";
import { canIssueDebtWhileNotInDefault, updateDebtDefaultStatus } from "./debtDefault";
import { applyDebtDefaultConsequences } from "./debtDefaultConsequences";
import { issueForeignOrBondDebt } from "./foreignDebt";
import { applyDomesticDefaultForeignDiplomacyHit, serviceForeignDebtWithDiplomacy } from "./foreignDebtDiplomacy";
import { tickLegitimacyWar } from "./legitimacyWar";
import { getStateDebtInterestRate, splitCreditorPayout, updateMoneylenderSnapshot } from "./moneylenders";
import { refreshTradeSanctions } from "./tradeSanctions";
import { isWarFootingActive } from "./warFooting";

/**
 * Multi-ledger PR-7…PR-15 — fiscal events: council, tax farm, public/foreign/bond debt,
 * coup aftermath, legitimacy war, trade sanctions, credit rating, session replay snapshots.
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
  /** PR-13 foreign debt interest paid this cycle. */
  foreignDebtInterest: number;
  /** PR-13 foreign debt principal issued this cycle. */
  foreignDebtIssued: number;
  /** PR-13 debt coup succeeded this cycle. */
  coupSucceeded: boolean;
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
  let foreignDebtInterest = 0;
  let foreignDebtIssued = 0;
  let coupSucceeded = false;
  let enteredDefault = false;
  let clearedDefault = false;
  let coupRisk = false;
  let coupSummary: string | undefined;

  // PR-8: refresh assembly support before any veto roll.
  const councilSupport = updateCouncilSupportSnapshot(state);
  // PR-11: budget-line approvals from support thresholds (+ PR-12 faction votes).
  const budgetApprovals = refreshCouncilBudgetApprovals(state);
  // PR-10: named syndicate + effective interest rate for this cycle.
  updateMoneylenderSnapshot(state);

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

  // ── Tax farming leak → credit pool + capital market / manager (PR-9) ────
  // PR-8 calibration: support slightly reduces farming abuse when assemblies are strong.
  const farmRate = getTaxFarmRate(state.form);
  const farmSupportFactor = state.form === "Republic" || state.form === "Union" ? 1 - (councilSupport - 50) / 400 : 1;
  if (farmRate > 0 && income > 0) {
    const desired = rn(income * farmRate * incomeScale * Math.max(0.5, farmSupportFactor), 2);
    const available = state.treasury || 0;
    taxFarmLeak = rn(Math.min(desired, available), 2);
    if (taxFarmLeak > 0) {
      state.treasury = rn(available - taxFarmLeak, 2);
      routeTaxFarmProceeds(state, taxFarmLeak);
    }
  }
  state.lastTaxFarmLeak = taxFarmLeak;

  // ── Public debt service (interest + repay → credit pool / syndicate, PR-9/10) ──
  const debt = state.publicDebt || 0;
  let interestDue = 0;
  if (debt > 0) {
    const interestRate = state.debtInterestRate ?? getStateDebtInterestRate(state);
    interestDue = rn(debt * interestRate, 2);
    const cash = state.treasury || 0;
    debtInterestPaid = rn(Math.min(interestDue, cash), 2);
    if (debtInterestPaid > 0) {
      state.treasury = rn(cash - debtInterestPaid, 2);
      // Syndicate split: named moneylenders take a personal cut of interest.
      payCreditorsWithSyndicate(state, debtInterestPaid, splitCreditorPayout);
    }
    // Unpaid coupon is capitalized onto principal (lenders keep the claim).
    const unpaid = rn(interestDue - debtInterestPaid, 2);
    if (unpaid > 0) {
      state.publicDebt = rn((state.publicDebt || 0) + unpaid, 2);
    }

    // PR-11: missed-interest streak → default freeze.
    // PR-12: merchant pool flight / coup risk while in default.
    const defaultStatus = updateDebtDefaultStatus(state, interestDue, debtInterestPaid);
    const consequences = applyDebtDefaultConsequences(state, defaultStatus);
    enteredDefault = defaultStatus.enteredDefault;
    clearedDefault = defaultStatus.clearedDefault;
    coupRisk = consequences.coupRisk;

    // Repay principal from surplus L2 (keep a small buffer) → pool + syndicate.
    // Only auto-repay when not deep in default coupon trouble (still allow if cash exists).
    const surplus = state.treasury || 0;
    if (surplus > WAR_DEBT_CASH_THRESHOLD && (state.publicDebt || 0) > 0) {
      const repay = rn(Math.min(surplus - WAR_DEBT_CASH_THRESHOLD, state.publicDebt || 0), 2);
      if (repay > 0) {
        state.treasury = rn(surplus - repay, 2);
        state.publicDebt = rn((state.publicDebt || 0) - repay, 2);
        payCreditorsWithSyndicate(state, repay, splitCreditorPayout);
        debtRepaid = repay;
      }
    }
  } else {
    // No principal → clear any stale default streak / coup flags.
    const defaultStatus = updateDebtDefaultStatus(state, 0, 0);
    applyDebtDefaultConsequences(state, defaultStatus);
    clearedDefault = defaultStatus.clearedDefault;
  }

  // ── PR-13/14 foreign debt service + diplomacy (外債) ────────────────────
  const foreignService = serviceForeignDebtWithDiplomacy(state);
  foreignDebtInterest = foreignService.interestPaid;
  const foreignDebtDefaulted = foreignService.enteredDefaultWith.length > 0;
  const diplomacyWorsened = foreignService.diplomacyWorsened.length;

  // PR-14: domestic public default also chills foreign creditors.
  if (enteredDefault) {
    applyDomesticDefaultForeignDiplomacyHit(state);
  }

  // ── Thin war debt issue from credit pool (PR-9/PR-11) ───────────────────
  // Cash-strapped at war: borrow only what moneylenders can fund and council allows.
  if (
    isWarFootingActive(state) &&
    stateHasEnemy(state) &&
    (state.form === "Republic" || state.form === "Monarchy") &&
    (state.treasury || 0) <= WAR_DEBT_CASH_THRESHOLD &&
    (state.publicDebt || 0) < PUBLIC_DEBT_CAP &&
    councilSupport >= 30 &&
    budgetApprovals.debtIssue &&
    canIssueDebtWhileNotInDefault(state)
  ) {
    const room = rn(PUBLIC_DEBT_CAP - (state.publicDebt || 0), 2);
    const want = rn(Math.min(WAR_DEBT_ISSUE_AMOUNT, room), 2);
    if (want > 0) {
      const { lent } = lendFromCreditPool(state, want);
      if (lent > 0) {
        debtIssued = lent;
        state.publicDebt = rn((state.publicDebt || 0) + lent, 2);
        state.treasury = rn((state.treasury || 0) + lent, 2);
      }
    }
  }

  // PR-13/14: if still cash-strapped after domestic pool, try bilateral then bond market.
  let bondMarketIssued = 0;
  if (
    isWarFootingActive(state) &&
    stateHasEnemy(state) &&
    (state.form === "Republic" || state.form === "Monarchy" || state.form === "Union") &&
    (state.treasury || 0) <= WAR_DEBT_CASH_THRESHOLD &&
    canIssueDebtWhileNotInDefault(state)
  ) {
    const foreign = issueForeignOrBondDebt(state);
    if (foreign.ok) {
      foreignDebtIssued = foreign.amount;
      if (foreign.viaBondMarket) bondMarketIssued = foreign.amount;
    }
  }

  // PR-13: acute debt-coup risk may transfer the crown (+ PR-14 aftermath).
  const coup = tryDebtCoup(state);
  if (coup.succeeded) {
    coupSucceeded = true;
    coupSummary = coup.summary;
  }
  if (state.debtCoupRisk) coupRisk = true;

  // PR-14: legitimacy recovery / civil unrest tick.
  const unrest = tickCoupLegitimacyAndUnrest(state);

  // PR-15: legitimacy war (pretender vs regime) while unrest is acute.
  const legitWar = tickLegitimacyWar(state);

  // PR-15: refresh FX trade sanctions for next collectTaxes cycle.
  refreshTradeSanctions(state);

  // PR-15: credit rating + bond reprice + thin secondary market transfer.
  refreshCreditRatingAndBondPrices(state);
  const secondary = runBondSecondaryMarket(state);

  state.lastDebtIssued = debtIssued;
  state.lastDebtRepaid = debtRepaid;

  // PR-13/14/15: chronicle this cycle's assembly session (incl. faction vote detail).
  recordCouncilSession(state, {
    councilFailed,
    councilSupport,
    debtVoteYes: state.councilLastDebtVoteYes,
    debtVoteFactionSummary: formatFactionVoteSummary(state.councilLastVoteFactionDetail),
    taxFarmLeak,
    debtIssued,
    debtRepaid,
    debtInterestPaid,
    enteredDefault,
    clearedDefault,
    foreignDebtIssued,
    foreignDebtInterest,
    foreignDebtDefaulted,
    diplomacyWorsened,
    bondMarketIssued,
    coupRisk,
    coupSucceeded,
    coupSummary,
    civilUnrestTick: unrest.unrestFired || legitWar.opened || legitWar.resolved,
    legitimacy: unrest.legitimacy
  });

  // PR-15: freeze session snapshot for replay / faction graphs.
  captureCouncilSessionSnapshot(state, {
    councilFailed,
    notes:
      (legitWar.summary ? `${legitWar.summary} ` : "") +
      (secondary.transferred > 0 ? `Bond secondary ${secondary.transferred} SP. ` : "") +
      (state.creditRating ? `Rating ${state.creditRating}.` : "")
  });

  return {
    incomeScale,
    councilFailed,
    councilSupport,
    councilFailChance: failChance,
    taxFarmLeak,
    debtInterestPaid,
    debtIssued,
    debtRepaid,
    foreignDebtInterest,
    foreignDebtIssued,
    coupSucceeded
  };
}
