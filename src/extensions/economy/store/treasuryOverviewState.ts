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
   * L0 personal wealth of the living landed ruler, if any. Distinct from publicTreasury and from
   * the household *stipend paid this cycle* (`household` column).
   */
  rulerPersonal: number;
  /**
   * Sum of nominal non-household department budgets this cycle (marshalcy…ecclesiastica).
   * Not yet real department balances (PR-3); display-only intent.
   */
  nominalDepartments: number;
  /** Household stipend actually paid to the ruler this cycle (into Character.wealth). */
  household: number;
  officeStipendsPaid: number;
  marshalcy: number;
  militaryFundingRatio: number;
  militaryDiscontent: number;
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
