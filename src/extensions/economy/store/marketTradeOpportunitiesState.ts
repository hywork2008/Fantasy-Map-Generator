import { create } from "zustand";

export interface MarketTradeOpportunityOption {
  goodId: number;
  goodName: string;
}

export interface MarketTradeOpportunityRow {
  sourceMarketId: number;
  targetMarketId: number;
  sourceMarketName: string;
  targetMarketName: string;
  buyPrice: number;
  sellPrice: number;
  transportCost: number;
  unitProfit: number;
  maxUnits: number;
  totalProfit: number;
}

export type MarketTradeOpportunitySort =
  | "source"
  | "target"
  | "buyPrice"
  | "sellPrice"
  | "transportCost"
  | "unitProfit"
  | "maxUnits"
  | "totalProfit";

interface MarketTradeOpportunitiesState {
  selectedGoodId: number | null;
  sortBy: MarketTradeOpportunitySort;
  sortDirection: number;
  options: MarketTradeOpportunityOption[];
  rows: MarketTradeOpportunityRow[];
}

export const useMarketTradeOpportunitiesState = create<MarketTradeOpportunitiesState>(() => ({
  selectedGoodId: null,
  sortBy: "totalProfit",
  sortDirection: -1,
  options: [],
  rows: []
}));

export const getMarketTradeOpportunitiesState = useMarketTradeOpportunitiesState.getState;
export const setMarketTradeOpportunitiesState = useMarketTradeOpportunitiesState.setState;
