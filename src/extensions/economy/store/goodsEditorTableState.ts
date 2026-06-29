import { create } from "zustand";

export interface GoodTableRow {
  i: number;
  name: string;
  color: string;
  strokeColor: string;
  icon: string;
  types: string[];
  tags: string[];
  produced: number;
  cellProduction: number;
  burgProduction: number;
  producedTip: string;
  stock: number;
  stockTip: string;
  basePrice: number;
  isDisplayed: boolean;
  isTagVisible: boolean;
}

interface GoodsEditorTableState {
  goods: GoodTableRow[];
  totalProduced: number;
  totalStock: number;
  displayedCount: number;
  isPercentageMode: boolean;
  hasTagFilter: boolean;
  isAssignMode: boolean;
  selectedAssignGoodId: number | null;
}

export const useGoodsEditorTableState = create<GoodsEditorTableState>(() => ({
  goods: [],
  totalProduced: 0,
  totalStock: 0,
  displayedCount: 0,
  isPercentageMode: false,
  hasTagFilter: false,
  isAssignMode: false,
  selectedAssignGoodId: null
}));

export const getGoodsEditorTableState = useGoodsEditorTableState.getState;
export const setGoodsEditorTableState = useGoodsEditorTableState.setState;
