import { create } from "zustand";

/** One physical hull row for the Vessel assets dialog (finite fleet P2). */
export interface VesselAssetsOverviewRow {
  key: string;
  hullId: number;
  ownerLabel: string;
  operatorLabel: string;
  homePort: string;
  shipClassName: string;
  /** Display duty: Idle / Patrol / Overseas escort / At sea / Loading / Maintenance */
  statusLabel: string;
  /** Port name or "At sea (N% → Dest)" */
  locationLabel: string;
  nextPortLabel: string;
  /** "Caravan #id · Good" or "—" */
  cargoLabel: string;
  /** Sort helpers */
  statusSort: number;
  locationSort: string;
  nextPortSort: string;
  cargoSort: string;
  navalCrewCapacity: number;
}

export interface VesselAssetsSummary {
  total: number;
  docked: number;
  voyage: number;
  cargo: number;
  maintenance: number;
  navalCrewCapacity: number;
}

interface VesselAssetsOverviewState {
  isOpen: boolean;
  rows: VesselAssetsOverviewRow[];
  summary: VesselAssetsSummary;
}

const emptySummary = (): VesselAssetsSummary => ({
  total: 0,
  docked: 0,
  voyage: 0,
  cargo: 0,
  maintenance: 0,
  navalCrewCapacity: 0
});

export const useVesselAssetsOverviewState = create<VesselAssetsOverviewState>(() => ({
  isOpen: false,
  rows: [],
  summary: emptySummary()
}));

export const setVesselAssetsOverviewState = useVesselAssetsOverviewState.setState;

export { emptySummary };
