import { create } from "zustand";

export interface MarketOverviewRow {
  goodId: number;
  goodName: string;
  goodColor: string;
  goodStroke: string;
  goodIcon: string;
  stock: number;
  price: number;
}

export interface MarketOverviewBurgMerchantRow {
  burgId: number;
  burgName: string;
  topMerchantName: string;
  topMerchantId?: number;
  topShare: number;
  topRevenue: number;
  rivals: string;
}

interface MarketOverviewOwner {
  coaId: string;
  name: string;
}

interface MarketOverviewState {
  marketId: number | null;
  name: string;
  defaultName: string;
  owner: MarketOverviewOwner | null;
  rows: MarketOverviewRow[];
  burgMerchantRows: MarketOverviewBurgMerchantRow[];
  cellsCount: number;
  burgsCount: number;
  totalStock: number;
  /** Percent 0-100, rounded. See Market.agTechStock (docs/plan/rural-agtech-investment.md). */
  agTechStockPercent: number;
}

export const useMarketOverviewState = create<MarketOverviewState>(() => ({
  marketId: null,
  name: "",
  defaultName: "",
  owner: null,
  rows: [],
  burgMerchantRows: [],
  cellsCount: 0,
  burgsCount: 0,
  totalStock: 0,
  agTechStockPercent: 0
}));

export const getMarketOverviewState = useMarketOverviewState.getState;
export const setMarketOverviewState = useMarketOverviewState.setState;
