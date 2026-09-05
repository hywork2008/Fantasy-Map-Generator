import { create } from "zustand";

export interface MapContextMenuState {
  isOpen: boolean;
  clientX: number;
  clientY: number;
  mapX: number;
  mapY: number;
  distanceFrom: [number, number] | null;
  activeRulerId: number | null;
  /** Burg under the cursor for the menu currently open, if any (resolved by handleMapContextMenu). */
  targetBurgId: number | null;
  targetBurgName: string | null;
  /** Burg captured from targetBurg* at the moment "Distance from here"/"Distance from {burg}" was clicked. */
  distanceFromBurgId: number | null;
  distanceFromName: string | null;
}

const INITIAL_STATE: MapContextMenuState = {
  isOpen: false,
  clientX: 0,
  clientY: 0,
  mapX: 0,
  mapY: 0,
  distanceFrom: null,
  activeRulerId: null,
  targetBurgId: null,
  targetBurgName: null,
  distanceFromBurgId: null,
  distanceFromName: null
};

export const useMapContextMenuState = create<MapContextMenuState>(() => ({ ...INITIAL_STATE }));

export const getMapContextMenuState = useMapContextMenuState.getState;
export const setMapContextMenuState = useMapContextMenuState.setState;

export function openMapContextMenu(
  clientX: number,
  clientY: number,
  mapX: number,
  mapY: number,
  targetBurgId: number | null = null,
  targetBurgName: string | null = null
): void {
  setMapContextMenuState({ isOpen: true, clientX, clientY, mapX, mapY, targetBurgId, targetBurgName });
}

export function closeMapContextMenu(): void {
  setMapContextMenuState({ isOpen: false });
}

export function setDistanceFromPoint(
  point: [number, number] | null,
  burgId: number | null = null,
  burgName: string | null = null
): void {
  setMapContextMenuState({
    distanceFrom: point,
    activeRulerId: null,
    distanceFromBurgId: burgId,
    distanceFromName: burgName
  });
}

export function setActiveDistanceRulerId(id: number | null): void {
  setMapContextMenuState({ activeRulerId: id });
}

export function resetDistanceSession(): void {
  setMapContextMenuState({
    isOpen: false,
    distanceFrom: null,
    activeRulerId: null,
    targetBurgId: null,
    targetBurgName: null,
    distanceFromBurgId: null,
    distanceFromName: null
  });
}
