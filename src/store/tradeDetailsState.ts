import { create } from "zustand";

export interface TradeSummary {
  sellerName: string;
  sellerType: string;
  buyerName: string;
  buyerType: string;
  onZoomSeller: () => void;
  onZoomBuyer: () => void;
}

export interface TradeDealRow {
  goodId: number;
  goodName: string;
  goodColor: string;
  goodStroke: string;
  goodIcon: string;
  units: number;
  price: number;
  value: number;
}

interface TradeDetailsState {
  summary: TradeSummary | null;
  rows: TradeDealRow[];
  distance: string;
  totalUnits: number;
  totalValue: number;
}

export const useTradeDetailsState = create<TradeDetailsState>(() => ({
  summary: null,
  rows: [],
  distance: "",
  totalUnits: 0,
  totalValue: 0
}));

export const getTradeDetailsState = useTradeDetailsState.getState;
export const setTradeDetailsState = useTradeDetailsState.setState;
