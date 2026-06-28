import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export type RouteOption = { id: number; name: string; length: string };

type RouteJoinDialogState = {
  isOpen: boolean;
  options: RouteOption[];
  onJoin: (selectedRouteId: number) => void;
  open: (opts: { options: RouteOption[]; onJoin: (id: number) => void }) => void;
  close: () => void;
};

export const routeJoinDialogStore = createStore<RouteJoinDialogState>(set => ({
  isOpen: false,
  options: [],
  onJoin: () => {},
  open: opts => set({ isOpen: true, ...opts }),
  close: () => set({ isOpen: false })
}));

export const useRouteJoinDialogState = <T>(selector: (s: RouteJoinDialogState) => T) =>
  useStore(routeJoinDialogStore, selector);
