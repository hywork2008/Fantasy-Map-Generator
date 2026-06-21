import { createStore, useStore } from "zustand";
import type { HierarchyProps } from "../controllers/hierarchy-tree";

interface HierarchyTreeState {
  props: HierarchyProps | null;
  selectedElementId: number | null;
  originSelectorOpen: boolean;
  refreshCounter: number;
  infoLine: string;
  setProps: (props: HierarchyProps | null) => void;
  setSelectedElementId: (id: number | null) => void;
  setOriginSelectorOpen: (open: boolean) => void;
  setInfoLine: (info: string) => void;
  updateElementCode: (id: number, code: string) => void;
  updateOrigins: (id: number, origins: (number | null)[]) => void;
  refresh: () => void;
}

export const hierarchyTreeStore = createStore<HierarchyTreeState>((set, get) => ({
  props: null,
  selectedElementId: null,
  originSelectorOpen: false,
  refreshCounter: 0,
  infoLine: "\u200D",

  setProps: props => set({ props, selectedElementId: null, originSelectorOpen: false, infoLine: "\u200D" }),
  setSelectedElementId: id => set({ selectedElementId: id, originSelectorOpen: false }),
  setOriginSelectorOpen: open => set({ originSelectorOpen: open }),
  setInfoLine: info => set({ infoLine: info }),

  updateElementCode: (id, code) => {
    const props = get().props;
    if (props) {
      const el = props.data.find(d => d.i === id);
      if (el) el.code = code;
    }
    set(state => ({ refreshCounter: state.refreshCounter + 1 }));
  },

  updateOrigins: (id, origins) => {
    const props = get().props;
    if (props) {
      const el = props.data.find(d => d.i === id);
      if (el) el.origins = origins;
    }
    set(state => ({ refreshCounter: state.refreshCounter + 1 }));
  },

  refresh: () => set(state => ({ refreshCounter: state.refreshCounter + 1 }))
}));

export const useHierarchyTreeState = <T>(selector: (state: HierarchyTreeState) => T) =>
  useStore(hierarchyTreeStore, selector);
