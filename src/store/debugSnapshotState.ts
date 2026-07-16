import { create } from "zustand";
import type { SimulationContext } from "../context/simulationContext";
import type { Burg, Province, State } from "../types/models";

// Define the shape of our filtered snapshot data
export interface SnapshotData {
  simulation: SimulationContext;
  states: Pick<State, "i" | "name" | "diplomacy" | "campaigns" | "military">[];
  burgs: Pick<Burg, "i" | "state" | "name" | "population" | "demographics">[];
  provinces: Pick<Province, "i" | "state" | "name">[];
}

export interface Snapshot {
  id: number; // timestamp
  tickCount: number;
  year: number;
  isLocked: boolean;
  label: string; // "Initial Generation", "Advance Time +10", etc.
  data: SnapshotData;
}

interface DebugSnapshotState {
  snapshots: Snapshot[];
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  addSnapshot: (snapshot: Omit<Snapshot, "id" | "isLocked"> & Partial<Pick<Snapshot, "isLocked">>) => void;
  removeSnapshot: (id: number) => void;
  toggleLock: (id: number) => void;
  clearUnlocked: () => void;
  clearAll: () => void;
  getSnapshot: (id: number) => Snapshot | undefined;
}

export const useDebugSnapshotState = create<DebugSnapshotState>((set, get) => ({
  snapshots: [],
  isOpen: false,
  setIsOpen: isOpen => set({ isOpen }),
  addSnapshot: snapshotInput =>
    set(state => {
      const newSnapshot: Snapshot = {
        ...snapshotInput,
        id: Date.now(),
        isLocked: snapshotInput.isLocked ?? false
      };
      return { snapshots: [...state.snapshots, newSnapshot] };
    }),
  removeSnapshot: id =>
    set(state => ({
      snapshots: state.snapshots.filter(s => s.id !== id)
    })),
  toggleLock: id =>
    set(state => ({
      snapshots: state.snapshots.map(s => (s.id === id ? { ...s, isLocked: !s.isLocked } : s))
    })),
  clearUnlocked: () =>
    set(state => ({
      snapshots: state.snapshots.filter(s => s.isLocked)
    })),
  clearAll: () => set({ snapshots: [] }),
  getSnapshot: id => get().snapshots.find(s => s.id === id)
}));
