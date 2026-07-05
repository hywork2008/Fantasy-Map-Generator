import { create } from "zustand";

export interface CellInfoData {
  cell: string;
  x: string;
  y: string;
  lat: string;
  lon: string;
  geozone: string;
  area: string;
  feature: string;
  prec: string;
  river: string;
  population: string;
  elevation: string;
  depth: string;
  temp: string;
  biome: string;
  state: string;
  province: string;
  culture: string;
  religion: string;
  burg: string;
  danger: string;
  // Extension fields
  good?: string;
  market?: string;
  cellProduction?: string;
  burgProduction?: string;
}

interface CellInfoState extends CellInfoData {
  updateInfo: (data: Partial<CellInfoData>) => void;
}

export const useCellInfoState = create<CellInfoState>(set => ({
  cell: "",
  x: "",
  y: "",
  lat: "",
  lon: "",
  geozone: "",
  area: "0",
  feature: "n/a",
  prec: "0",
  river: "no",
  population: "0",
  elevation: "0",
  depth: "0",
  temp: "0",
  biome: "n/a",
  state: "n/a",
  province: "n/a",
  culture: "n/a",
  religion: "n/a",
  burg: "n/a",
  danger: "n/a",
  good: "n/a",
  market: "n/a",
  cellProduction: "n/a",
  burgProduction: "n/a",
  updateInfo: data => set(state => ({ ...state, ...data }))
}));
