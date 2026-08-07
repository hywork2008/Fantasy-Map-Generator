import { create } from "zustand";
import type { GoodsUnitFlavor } from "../generators/goodsUnitFlavor";

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
  cumulativeSales: number;
  resourceCells: number;
  productionPerThousand: number;
  basePrice: number;
  unitFlavor?: GoodsUnitFlavor;
  isDisplayed: boolean;
  isTagVisible: boolean;
}

interface GoodsEditorTableState {
  goods: GoodTableRow[];
  totalProduced: number;
  totalStock: number;
  totalCumulativeSales: number;
  displayedCount: number;
  isPercentageMode: boolean;
  hasTagFilter: boolean;
  isAssignMode: boolean;
  selectedAssignGoodId: number | null;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export const useGoodsEditorTableState = create<GoodsEditorTableState>(() => ({
  goods: [],
  totalProduced: 0,
  totalStock: 0,
  totalCumulativeSales: 0,
  displayedCount: 0,
  isPercentageMode: false,
  hasTagFilter: false,
  isAssignMode: false,
  selectedAssignGoodId: null,
  sortBy: "name",
  sortOrder: "asc"
}));

export const getGoodsEditorTableState = useGoodsEditorTableState.getState;
export const setGoodsEditorTableState = useGoodsEditorTableState.setState;
