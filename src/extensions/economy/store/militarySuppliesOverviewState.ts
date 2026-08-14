import { create } from "zustand";

export interface MilitarySuppliesOverviewRow {
  stateId: number;
  stateName: string;
  /** Serviceable state-owned weapon sets. */
  arms: number;
  /** Finished arrows held in the State military stockpile. */
  arrows: number;
  /** Mounted troops assigned to military mounts (horses or camels). */
  mounts: number;
  /** Serviceable state-owned firearms. */
  muskets: number;
  /** Finished bullets held in the State military stockpile. */
  bullets: number;
  /** Serviceable state-owned cannon/artillery pieces. */
  artillery: number;
  /** Finished gunpowder held in the State military stockpile. */
  gunpowder: number;
}

interface MilitarySuppliesOverviewState {
  rows: MilitarySuppliesOverviewRow[];
}

export const useMilitarySuppliesOverviewState = create<MilitarySuppliesOverviewState>(() => ({ rows: [] }));

export const getMilitarySuppliesOverviewState = useMilitarySuppliesOverviewState.getState;
export const setMilitarySuppliesOverviewState = useMilitarySuppliesOverviewState.setState;
