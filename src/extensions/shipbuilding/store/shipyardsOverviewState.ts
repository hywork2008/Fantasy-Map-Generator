import { create } from "zustand";

export interface ShipyardOverviewRow {
  burgId: number;
  burgName: string;
  x: number;
  y: number;
  owner: "state" | "market";
  ownerLabel: string;
  shipClassName: string;
  progressPct: number;
  completedHulls: number;
}

interface ShipyardsOverviewState {
  isOpen: boolean;
  rows: ShipyardOverviewRow[];
  onZoom: (x: number, y: number) => void;
}

export const useShipyardsOverviewState = create<ShipyardsOverviewState>(() => ({
  isOpen: false,
  rows: [],
  onZoom: () => {}
}));

export const setShipyardsOverviewState = useShipyardsOverviewState.setState;
