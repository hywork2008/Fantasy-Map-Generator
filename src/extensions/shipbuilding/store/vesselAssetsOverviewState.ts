import { create } from "zustand";

export interface VesselAssetsOverviewRow {
  key: string;
  ownerLabel: string;
  operatorLabel: string;
  homePort: string;
  shipClassName: string;
  docked: number;
  voyage: number;
  cargo: number;
  maintenance: number;
  total: number;
  navalCrewCapacity: number;
}

interface VesselAssetsOverviewState {
  isOpen: boolean;
  rows: VesselAssetsOverviewRow[];
}

export const useVesselAssetsOverviewState = create<VesselAssetsOverviewState>(() => ({
  isOpen: false,
  rows: []
}));

export const setVesselAssetsOverviewState = useVesselAssetsOverviewState.setState;
