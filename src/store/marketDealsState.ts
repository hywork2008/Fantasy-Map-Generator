import { create } from "zustand";

export interface MarketDealRow {
  id: number;
  goodId: number;
  goodName: string;
  goodColor: string;
  goodStroke: string;
  goodIcon: string;
  direction: "in" | "out";
  counterpartyType: "burg" | "market";
  partyName: string;
  units: number;
  income: number;
  incomeColor: string;
  backColor: string;
}

interface MarketDealsState {
  rows: MarketDealRow[];
  dealsCount: number;
  netFlow: number;
  onRowClick: (row: MarketDealRow) => void;
}

export const useMarketDealsState = create<MarketDealsState>(() => ({
  rows: [],
  dealsCount: 0,
  netFlow: 0,
  onRowClick: () => {}
}));

export const getMarketDealsState = useMarketDealsState.getState;
export const setMarketDealsState = useMarketDealsState.setState;
