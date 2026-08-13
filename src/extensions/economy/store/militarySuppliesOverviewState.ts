import { create } from "zustand";

export interface MilitarySuppliesOverviewRow {
  stateId: number;
  stateName: string;
  /** Serviceable state-owned weapon sets. */
  arms: number;
  /** Finished arrows delivered to the army in the latest production cycle. */
  arrows: number;
  /** Mounted troops assigned to military mounts (horses or camels). */
  mounts: number;
  /** Serviceable state-owned firearms. */
  muskets: number;
  /** Finished bullets delivered to the army in the latest production cycle. */
  bullets: number;
  /** Serviceable state-owned cannon/artillery pieces. */
  artillery: number;
  /** Finished gunpowder delivered to the army in the latest production cycle. */
  gunpowder: number;
}

interface MilitarySuppliesOverviewState {
  rows: MilitarySuppliesOverviewRow[];
}

export const useMilitarySuppliesOverviewState = create<MilitarySuppliesOverviewState>(() => ({ rows: [] }));

export const getMilitarySuppliesOverviewState = useMilitarySuppliesOverviewState.getState;
export const setMilitarySuppliesOverviewState = useMilitarySuppliesOverviewState.setState;
