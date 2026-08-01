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
  dealId: number;
  goodId: number;
  goodName: string;
  goodColor: string;
  goodStroke: string;
  goodIcon: string;
  units: number;
  price: number;
  value: number;
  cargoSlotsPerUnit: number;
  occupiedSlots: number;
}

export interface TradeTransportSummary {
  mode: "land" | "water" | "sea" | "river";
  transportName: string;
  unitCount: number;
  usedSlots: number;
  capacitySlots: number;
  freeSlots: number;
  utilization: number;
  assetSource?: string;
  reservationState?: string;
}

export interface TradeRouteLegSummary {
  mode: "land" | "water" | "sea" | "river";
  distance: number;
}

interface TradeDetailsState {
  summary: TradeSummary | null;
  rows: TradeDealRow[];
  distance: string;
  totalUnits: number;
  totalValue: number;
  transportSummaries: TradeTransportSummary[];
  routeLegs: TradeRouteLegSummary[];
  sortBy: "good" | "units" | "price" | "value";
  sortDirection: number;
}

export const useTradeDetailsState = create<TradeDetailsState>(() => ({
  summary: null,
  rows: [],
  distance: "",
  totalUnits: 0,
  totalValue: 0,
  transportSummaries: [],
  routeLegs: [],
  sortBy: "units",
  sortDirection: -1
}));

export const getTradeDetailsState = useTradeDetailsState.getState;
export const setTradeDetailsState = useTradeDetailsState.setState;
