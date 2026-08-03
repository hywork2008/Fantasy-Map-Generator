import { create } from "zustand";

export interface TreasuryOverviewRow {
  id: number; // stateId
  stateName: string;
  form: string;
  domesticIncome: number;
  /**
   * L2 public treasury stock (`state.treasury`) — institutional cash, not the ruler's purse.
   * Multi-ledger PR-1 (docs/plan/multi-ledger-fiscal-architecture.md).
   */
  publicTreasury: number;
  /**
   * L1 crown household purse (`state.householdPurse`) — institutional court cash (PR-2).
   * Distinct from ruler personal wealth and from this-cycle HH stipend paid.
   */
  householdPurse: number;
  /**
   * L0 personal wealth of the living landed ruler, if any. Distinct from publicTreasury and from
   * the household *stipend paid this cycle* (`household` column).
   */
  rulerPersonal: number;
  /**
   * Sum of nominal non-household department budgets this cycle (marshalcy…ecclesiastica).
   * Intent for this cycle; real spendable cash is departmentBalancesStock.
   */
  nominalDepartments: number;
  /**
   * L3a sum of real departmentBalances stock (after this cycle's credit and office personal pay).
   */
  departmentBalancesStock: number;
  /** Household stipend actually paid to the ruler this cycle (into Character.wealth). */
  household: number;
  officeStipendsPaid: number;
  marshalcy: number;
  militaryFundingRatio: number;
  militaryDiscontent: number;
  /** PR-6 war footing policy flag. */
  warFooting: boolean;
  /** PR-6 troop-target uplift (0 when inactive). */
  militaryMobilizationBoost: number;
  /** PR-7 public debt principal. */
  publicDebt: number;
  /** PR-9 credit pool (moneylender) balance. */
  creditPoolBalance: number;
  /** PR-10 primary named moneylender. */
  primaryMoneylenderName: string;
  /** PR-10 effective interest rate fraction. */
  debtInterestRate: number;
  /** PR-11 debt default flag. */
  debtInDefault: boolean;
  /** PR-12 debt coup-risk flag. */
  debtCoupRisk: boolean;
  /** PR-8 assembly support 0–100. */
  councilSupport: number;
  /** PR-12 last debt-issue vote yes share 0–1. */
  councilLastDebtVoteYes: number;
  /** PR-8 last-cycle tax farm leak. */
  lastTaxFarmLeak: number;
  /** PR-12 domain levy → poll tax multiplier. */
  domainPollTaxMultiplier: number;
  /** PR-13 foreign debt principal. */
  foreignDebt: number;
  /** PR-14 foreign debt default flag. */
  foreignDebtInDefault: boolean;
  /** PR-14 coup legitimacy (0 if none). */
  coupLegitimacy: number;
  /** PR-14 civil unrest. */
  civilUnrest: boolean;
  /** PR-15 credit rating. */
  creditRating: string;
  /** PR-15 trade sanction mult. */
  tradeSanctionMult: number;
  /** PR-15 legitimacy war active. */
  legitimacyWarActive: boolean;
  /** PR-13 assembly session count. */
  councilSessionNumber: number;
  chancery: number;
  stewardship: number;
  spymastery: number;
  ecclesiastica: number;
}

interface TreasuryOverviewState {
  rows: TreasuryOverviewRow[];
}

export const useTreasuryOverviewState = create<TreasuryOverviewState>(() => ({ rows: [] }));

export const getTreasuryOverviewState = useTreasuryOverviewState.getState;
export const setTreasuryOverviewState = useTreasuryOverviewState.setState;
