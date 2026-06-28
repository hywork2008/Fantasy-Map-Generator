import { create } from "zustand";

interface RiverCreatorStore {
  riverCells: number[];
  setRiverCells: (cells: number[]) => void;
  addCell: (cell: number) => void;
  removeCell: (cell: number) => void;
}

export const useRiverCreatorStore = create<RiverCreatorStore>(set => ({
  riverCells: [],
  setRiverCells: cells => set({ riverCells: cells }),
  addCell: cell => set(state => ({ riverCells: [...state.riverCells, cell] })),
  removeCell: cell => set(state => ({ riverCells: state.riverCells.filter(c => c !== cell) }))
}));
