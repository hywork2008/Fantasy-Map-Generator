import { create } from "zustand";

export interface MarketRowData {
  i: number;
  centerName: string;
  ownerName: string;
  cells: number;
  burgs: number;
  stock: number;
  sales: number;
  buys: number;
  value: number;
  color: string;
  isNoMarket: boolean;
}

export interface MarketsOverviewState {
  isOpen: boolean;
  sortBy: string;
  sortDirection: number;
  isPercentageMode: boolean;
  markets: MarketRowData[];
  totalMarkets: number;
  avgSales: number;
  avgBuys: number;
  avgValue: number;
}

export const useMarketsOverviewState = create<MarketsOverviewState>(() => ({
  isOpen: false,
  sortBy: "market",
  sortDirection: 1,
  isPercentageMode: false,
  markets: [],
  totalMarkets: 0,
  avgSales: 0,
  avgBuys: 0,
  avgValue: 0
}));

export const getMarketsOverviewState = useMarketsOverviewState.getState;
export const setMarketsOverviewState = useMarketsOverviewState.setState;
