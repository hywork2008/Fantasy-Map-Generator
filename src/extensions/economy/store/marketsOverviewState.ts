import { create } from "zustand";

export interface MarketRowData {
  i: number;
  centerName: string;
  managerName: string;
  managerId?: number;
  cells: number;
  burgs: number;
  stock: number;
  sales: number;
  buys: number;
  value: number;
  color: string;
  isNoMarket: boolean;
  population: number;
}

export interface MarketsOverviewState {
  isOpen: boolean;
  sortBy: string;
  sortDirection: number;
  isPercentageMode: boolean;
  mode: "default" | "manual" | "add";
  selectedMarketId: number | null;
  brushSize: number;
  markets: MarketRowData[];
  totalMarkets: number;
  avgSales: number;
  avgBuys: number;
  avgValue: number;
  totalPopulation: number;
}

export const useMarketsOverviewState = create<MarketsOverviewState>(() => ({
  isOpen: false,
  sortBy: "market",
  sortDirection: 1,
  isPercentageMode: false,
  mode: "default",
  selectedMarketId: null,
  brushSize: 20,
  markets: [],
  totalMarkets: 0,
  avgSales: 0,
  avgBuys: 0,
  avgValue: 0,
  totalPopulation: 0
}));

export const getMarketsOverviewState = useMarketsOverviewState.getState;
export const setMarketsOverviewState = useMarketsOverviewState.setState;
