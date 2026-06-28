import { create } from "zustand";

export interface RouteGroupInfo {
  id: string;
  count: number;
}

interface RouteGroupsEditorStore {
  groups: RouteGroupInfo[];
  setGroups: (groups: RouteGroupInfo[]) => void;
}

export const useRouteGroupsEditorStore = create<RouteGroupsEditorStore>(set => ({
  groups: [],
  setGroups: groups => set({ groups })
}));
