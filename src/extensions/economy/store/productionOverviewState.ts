import { create } from "zustand";

export interface ProductionOverviewRow {
  id: number;
  kind: "manufactured" | "sold" | "bought";
  goodId: number;
  goodName: string;
  goodColor: string;
  goodStroke: string;
  goodIcon: string;
  units: number;
  price: number;
  net: number;
  tax: number;
}

interface ProductionOverviewState {
  burgId: number | null;
  burgName: string;
  rows: ProductionOverviewRow[];
  wealth: string;
  treasury: string;
  taxPaid: string;
}

export const useProductionOverviewState = create<ProductionOverviewState>(() => ({
  burgId: null,
  burgName: "",
  rows: [],
  wealth: "",
  treasury: "",
  taxPaid: ""
}));

export const getProductionOverviewState = useProductionOverviewState.getState;
export const setProductionOverviewState = useProductionOverviewState.setState;
