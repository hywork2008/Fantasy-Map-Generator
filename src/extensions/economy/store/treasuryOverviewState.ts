import { create } from "zustand";

export interface TreasuryOverviewRow {
  id: number; // stateId
  stateName: string;
  form: string;
  domesticIncome: number;
  household: number;
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
