import { create } from "zustand";

export interface StockRow {
  id: number;
  name: string;
  type: "market" | "burg";
  x: number;
  y: number;
  stock: number;
}

interface GoodsStockDialogState {
  isOpen: boolean;
  goodName: string;
  sources: StockRow[];
  onZoom: (x: number, y: number) => void;
}

export const useGoodsStockDialogState = create<GoodsStockDialogState>(() => ({
  isOpen: false,
  goodName: "",
  sources: [],
  onZoom: () => {}
}));

export const getGoodsStockDialogState = useGoodsStockDialogState.getState;
export const setGoodsStockDialogState = useGoodsStockDialogState.setState;
