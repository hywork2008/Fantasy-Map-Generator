import { create } from "zustand";

export type MineralSupplyStatus = "active" | "idle" | "unprospected" | "exhausted" | "absent";

export interface MineralCommodityOverviewRow {
  commodity: string;
  depositCount: number;
  discoveredCount: number;
  activeMineCount: number;
  reserveTons: number;
  annualCapacityTons: number;
  annualOutputTons: number;
  status: MineralSupplyStatus;
}

export interface MineralDepositOverviewRow {
  id: number;
  cell: number;
  districtType: string;
  primaryCommodity: string;
  commodities: string;
  burgName: string;
  depth: string;
  richness: number;
  discovered: boolean;
  status: MineralSupplyStatus;
  reserveTons: number;
  annualCapacityTons: number;
  annualOutputTons: number;
}

interface MineralOverviewState {
  commodities: MineralCommodityOverviewRow[];
  deposits: MineralDepositOverviewRow[];
}

export const useMineralOverviewState = create<MineralOverviewState>(() => ({
  commodities: [],
  deposits: []
}));

export const getMineralOverviewState = useMineralOverviewState.getState;
export const setMineralOverviewState = useMineralOverviewState.setState;
