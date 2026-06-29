import { create } from "zustand";

export interface MarketsGoodCompareOption {
  goodId: number;
  goodName: string;
}

export interface MarketsGoodCompareRow {
  marketId: number;
  marketName: string;
  marketColor: string;
  stock: number;
  price: number;
}

interface MarketsGoodCompareState {
  selectedGoodId: number | null;
  sortBy: "market" | "stock" | "price";
  sortDirection: number;
  isPercentageMode: boolean;
  options: MarketsGoodCompareOption[];
  rows: MarketsGoodCompareRow[];
  totalStock: number;
  avgPrice: number;
}

export const useMarketsGoodCompareState = create<MarketsGoodCompareState>(() => ({
  selectedGoodId: null,
  sortBy: "stock",
  sortDirection: -1,
  isPercentageMode: false,
  options: [],
  rows: [],
  totalStock: 0,
  avgPrice: 0
}));

export const getMarketsGoodCompareState = useMarketsGoodCompareState.getState;
export const setMarketsGoodCompareState = useMarketsGoodCompareState.setState;
