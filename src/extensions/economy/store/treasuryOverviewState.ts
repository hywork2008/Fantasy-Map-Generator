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
