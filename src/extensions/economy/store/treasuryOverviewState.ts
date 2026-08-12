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
  /**
   * PR-17b — smoothed 0..1 liquidity-based service level per non-marshalcy department.
   * 1 = fully funded recently, 0 = the treasury could not afford it. Feeds real gameplay effects
   * (e.g. Stewardship → administrative upkeep/tax efficiency, PR-17b; Spymastery → espionage
   * effectiveness, PR-17d). docs/plan/department-budget-spending-effects.md §3.
   */
  chanceryServiceLevel: number;
  stewardshipServiceLevel: number;
  spymasteryServiceLevel: number;
  ecclesiasticaServiceLevel: number;
  /** PR-17c — player's per-department budget multiplier, 1 = unchanged from form baseline. */
  chanceryBudgetMultiplier: number;
  stewardshipBudgetMultiplier: number;
  spymasteryBudgetMultiplier: number;
  ecclesiasticaBudgetMultiplier: number;
  /** PR-17a — cash remitted L3a → L2 this cycle because a non-marshalcy balance hit its cap. */
  departmentBalanceRemit: number;
  /**
   * PR-17g — 0..100 accumulated diplomatic reputation driven by Chancery's service level; below
   * 30 risks straining an existing alliance. docs/plan/department-budget-spending-effects.md §3.4.
   */
  diplomaticReliability: number;
  /**
   * PR-17h — 0..100 accumulated religious unrest driven by Ecclesiastica's service level; above
   * 40 costs assembly support (councilAssembly.ts). docs/plan/department-budget-spending-effects.md §3.3.
   */
  religiousUnrest: number;
}

interface TreasuryOverviewState {
  rows: TreasuryOverviewRow[];
}

export const useTreasuryOverviewState = create<TreasuryOverviewState>(() => ({ rows: [] }));

export const getTreasuryOverviewState = useTreasuryOverviewState.getState;
export const setTreasuryOverviewState = useTreasuryOverviewState.setState;
