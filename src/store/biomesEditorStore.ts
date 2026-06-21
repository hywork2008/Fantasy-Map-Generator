import { create } from "zustand";

export interface BiomeRow {
  i: number;
  name: string;
  habitability: number;
  color: string;
  cells: number;
  area: number;
  population: number;
  populationTip: string;
  canRemove: boolean;
}

export interface BiomesFooter {
  biomes: number;
  cells: number;
  totalArea: number;
  mapArea: number;
  totalPopulation: number;
  unit: string;
}

interface BiomesEditorStore {
  rows: BiomeRow[];
  footer: BiomesFooter;
  displayMode: "absolute" | "percentage";
  selectedBiomeId: number | null;
  isCustomizationMode: boolean;
  refreshCount: number;
  setData: (rows: BiomeRow[], footer: BiomesFooter) => void;
  toggleDisplayMode: () => void;
  updateRowColor: (biomeId: number, color: string) => void;
  updateRowName: (biomeId: number, name: string) => void;
  addRow: (row: BiomeRow) => void;
  removeRow: (biomeId: number) => void;
  setSelectedBiomeId: (id: number | null) => void;
  setCustomizationMode: (active: boolean) => void;
}

export const useBiomesEditorStore = create<BiomesEditorStore>(set => ({
  rows: [],
  footer: { biomes: 0, cells: 0, totalArea: 0, mapArea: 0, totalPopulation: 0, unit: "" },
  displayMode: "absolute",
  selectedBiomeId: null,
  isCustomizationMode: false,
  refreshCount: 0,

  setData: (rows, footer) =>
    set(state => ({ rows, footer, displayMode: "absolute", refreshCount: state.refreshCount + 1 })),

  toggleDisplayMode: () =>
    set(state => ({ displayMode: state.displayMode === "absolute" ? "percentage" : "absolute" })),

  updateRowColor: (biomeId, color) =>
    set(state => ({ rows: state.rows.map(r => (r.i === biomeId ? { ...r, color } : r)) })),

  updateRowName: (biomeId, name) =>
    set(state => ({ rows: state.rows.map(r => (r.i === biomeId ? { ...r, name } : r)) })),

  addRow: row =>
    set(state => ({
      rows: [...state.rows, row],
      footer: { ...state.footer, biomes: state.footer.biomes + 1 }
    })),

  removeRow: biomeId =>
    set(state => ({
      rows: state.rows.filter(r => r.i !== biomeId),
      footer: { ...state.footer, biomes: state.footer.biomes - 1 }
    })),

  setSelectedBiomeId: id => set({ selectedBiomeId: id }),
  setCustomizationMode: active => set({ isCustomizationMode: active })
}));
