import { create } from "zustand";

export interface MapContextMenuState {
  isOpen: boolean;
  clientX: number;
  clientY: number;
  mapX: number;
  mapY: number;
  distanceFrom: [number, number] | null;
  activeRulerId: number | null;
}

const INITIAL_STATE: MapContextMenuState = {
  isOpen: false,
  clientX: 0,
  clientY: 0,
  mapX: 0,
  mapY: 0,
  distanceFrom: null,
  activeRulerId: null
};

export const useMapContextMenuState = create<MapContextMenuState>(() => ({ ...INITIAL_STATE }));

export const getMapContextMenuState = useMapContextMenuState.getState;
export const setMapContextMenuState = useMapContextMenuState.setState;

export function openMapContextMenu(clientX: number, clientY: number, mapX: number, mapY: number): void {
  setMapContextMenuState({ isOpen: true, clientX, clientY, mapX, mapY });
}

export function closeMapContextMenu(): void {
  setMapContextMenuState({ isOpen: false });
}

export function setDistanceFromPoint(point: [number, number] | null): void {
  setMapContextMenuState({ distanceFrom: point, activeRulerId: null });
}

export function setActiveDistanceRulerId(id: number | null): void {
  setMapContextMenuState({ activeRulerId: id });
}

export function resetDistanceSession(): void {
  setMapContextMenuState({ isOpen: false, distanceFrom: null, activeRulerId: null });
}
