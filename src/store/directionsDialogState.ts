import { create } from "zustand";
import type { DirectionsResult, TravelMode } from "../services/travelDirections";

interface DirectionsDialogOpenData {
  fromBurgId: number;
  toBurgId: number;
  fromName: string;
  toName: string;
  result: DirectionsResult;
  selectedMode: TravelMode | null;
}

interface DirectionsDialogState extends DirectionsDialogOpenData {
  avoidSea: boolean;
  preferSea: boolean;
  open: (data: DirectionsDialogOpenData) => void;
  selectMode: (mode: TravelMode) => void;
  /** Applied after the caller recomputes directions with avoidSea/preferSea options. */
  applySeaOptions: (
    options: { avoidSea: boolean; preferSea: boolean },
    result: DirectionsResult,
    selectedMode: TravelMode | null
  ) => void;
  /** Backwards compatibility alias for applySeaOptions({ avoidSea, preferSea: false }, ...) */
  applyAvoidSea: (avoidSea: boolean, result: DirectionsResult, selectedMode: TravelMode | null) => void;
  reset: () => void;
}

const EMPTY_STATE: DirectionsDialogOpenData & { avoidSea: boolean; preferSea: boolean } = {
  fromBurgId: 0,
  toBurgId: 0,
  fromName: "",
  toName: "",
  result: null as unknown as DirectionsResult,
  selectedMode: null,
  avoidSea: false,
  preferSea: false
};

/**
 * Payload store for the burg-to-burg Directions dialog (src/ui/dialogs/DirectionsDialog.tsx).
 * Visibility itself is tracked by the shared dialog store (`useDialogState`/`openDialog`/
 * `closeDialog`, id "directions") — mirrors ElevationProfileDialog's split between a dedicated
 * payload store and the shared open/close flag.
 */
export const useDirectionsDialogState = create<DirectionsDialogState>(set => ({
  ...EMPTY_STATE,
  open: data => set({ ...data, avoidSea: false, preferSea: false }),
  selectMode: mode => set({ selectedMode: mode }),
  applySeaOptions: (options, result, selectedMode) =>
    set({ avoidSea: options.avoidSea, preferSea: options.preferSea, result, selectedMode }),
  applyAvoidSea: (avoidSea, result, selectedMode) => set({ avoidSea, preferSea: false, result, selectedMode }),
  reset: () => set({ ...EMPTY_STATE })
}));
