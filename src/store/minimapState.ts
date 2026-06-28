import { create } from "zustand";

export interface MinimapState {
  viewBox: string;
  transform: string;
  viewportX: string;
  viewportY: string;
  viewportWidth: string;
  viewportHeight: string;
}

export const useMinimapState = create<MinimapState>(() => ({
  viewBox: "0 0 100 100",
  transform: "translate(0 0) scale(1)",
  viewportX: "0",
  viewportY: "0",
  viewportWidth: "100",
  viewportHeight: "100"
}));

export const getMinimapState = useMinimapState.getState;
export const setMinimapState = useMinimapState.setState;
