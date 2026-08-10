import { create } from "zustand";

export interface MetallurgWorkOrderRow {
  id: number;
  ownerName: string;
  productName: string;
  kind: "newBuild" | "replacement" | "maintenance" | "consumable";
  status: "queued" | "waitingMaterials" | "inProgress" | "completed";
  remainingUnits: number;
  remainingWork: number;
  materialCoverage: number;
}

export interface MetallurgMaterialForecastRow {
  id: string;
  marketName: string;
  materialName: string;
  requiredUnits: number;
  availableMarketStock: number;
  inboundUnits: number;
  projectedShortage: number;
  workOrderCount: number;
}

interface MetallurgWorkOverviewState {
  orders: MetallurgWorkOrderRow[];
  materials: MetallurgMaterialForecastRow[];
  queuedWork: number;
  blockedWork: number;
  shortageCount: number;
}

export const useMetallurgWorkOverviewState = create<MetallurgWorkOverviewState>(() => ({
  orders: [],
  materials: [],
  queuedWork: 0,
  blockedWork: 0,
  shortageCount: 0
}));

export const getMetallurgWorkOverviewState = useMetallurgWorkOverviewState.getState;
export const setMetallurgWorkOverviewState = useMetallurgWorkOverviewState.setState;
