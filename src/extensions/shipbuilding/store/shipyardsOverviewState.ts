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
  /** Current local-market supply state for the next construction batch. */
  materialStatus: string;
  /** "docked small/medium/large of capacity small/medium/large" — see docs/plan/ships.md "港湾収容力（暫定案）". */
  portOccupancyLabel: string;
  /** Hulls currently out on a trade/training voyage (docs/plan/ships.md "航海訓練・偽装通商・諜報（暫定案）"), not occupying a berth. */
  atSeaCount: number;
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
