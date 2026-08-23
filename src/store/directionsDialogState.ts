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
  selectedRouteId: string | null;
  open: (data: DirectionsDialogOpenData) => void;
  selectMode: (mode: TravelMode) => void;
  selectRoute: (routeId: string) => void;
  reset: () => void;
}

const EMPTY_STATE: DirectionsDialogOpenData & { selectedRouteId: string | null } = {
  fromBurgId: 0,
  toBurgId: 0,
  fromName: "",
  toName: "",
  result: null as unknown as DirectionsResult,
  selectedMode: null,
  selectedRouteId: null
};

/**
 * Payload store for the burg-to-burg Directions dialog (src/ui/dialogs/DirectionsDialog.tsx).
 * Visibility itself is tracked by the shared dialog store (`useDialogState`/`openDialog`/
 * `closeDialog`, id "directions") — mirrors ElevationProfileDialog's split between a dedicated
 * payload store and the shared open/close flag.
 */
export const useDirectionsDialogState = create<DirectionsDialogState>(set => ({
  ...EMPTY_STATE,
  open: data => set({ ...data, selectedRouteId: null }),
  selectMode: mode => set({ selectedMode: mode, selectedRouteId: null }),
  selectRoute: routeId => set({ selectedRouteId: routeId }),
  reset: () => set({ ...EMPTY_STATE })
}));
