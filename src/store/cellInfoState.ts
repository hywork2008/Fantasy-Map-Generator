import { create } from "zustand";

export interface CellInfoData {
  cell: string;
  /** Raw packed-cell id and climate values for tools that need model units, not display formatting. */
  cellId: number | null;
  temperature: number | null;
  precipitation: number | null;
  x: string;
  y: string;
  lat: string;
  lon: string;
  geozone: string;
  area: string;
  feature: string;
  prec: string;
  river: string;
  /** Estimated river-surface velocity at this cell, or "n/a" when no river passes through it. */
  riverSurfaceVelocity: string;
  /** Estimated river-channel depth at this cell, or "n/a" when no river passes through it. */
  riverWaterDepth: string;
  /** Estimated river-surface temperature at this cell, or "n/a" when no river passes through it. */
  riverWaterTemperature: string;
  population: string;
  /** Dominant food strategy used for rural carrying capacity. */
  livelihood: string;
  /** Local rural capacity after food availability, before any imports. */
  subsistenceCapacity: string;
  elevation: string;
  depth: string;
  temp: string;
  biome: string;
  /** Derived from potential forest capacity and the live standing-timber stock. */
  forestClearance: string;
  coastalHabitat: string;
  nearshoreHabitat: string;
  /** Ocean current direction in degrees, or "n/a" off open ocean. See `grid.cells.currentAngle`. */
  currentDirection: string;
  /** Ocean current speed as a percentage of the 0-255 scale, or "n/a" off open ocean. */
  currentSpeed: string;
  /** Surface water temperature, or "n/a" off open ocean. See `grid.cells.waterTemp`. */
  waterTemp: string;
  /** How enclosed/sheltered the water is (0 = open, 100 = fully enclosed), or "n/a" on land. */
  enclosure: string;
  state: string;
  province: string;
  culture: string;
  religion: string;
  burg: string;
  danger: string;
  /** Extension-supplied row values, keyed by the id passed to ExtensionAPI.registerCellInfoRow(). */
  extra: Record<string, string>;
}

interface CellInfoState extends CellInfoData {
  updateInfo: (data: Partial<CellInfoData>) => void;
  isPinned: boolean;
  togglePinned: () => void;
}

export const useCellInfoState = create<CellInfoState>(set => ({
  cell: "",
  cellId: null,
  temperature: null,
  precipitation: null,
  x: "",
  y: "",
  lat: "",
  lon: "",
  geozone: "",
  area: "0",
  feature: "n/a",
  prec: "0",
  river: "no",
  riverSurfaceVelocity: "n/a",
  riverWaterDepth: "n/a",
  riverWaterTemperature: "n/a",
  population: "0",
  livelihood: "n/a",
  subsistenceCapacity: "n/a",
  elevation: "0",
  depth: "0",
  temp: "0",
  biome: "n/a",
  forestClearance: "n/a",
  coastalHabitat: "none",
  nearshoreHabitat: "none",
  currentDirection: "n/a",
  currentSpeed: "n/a",
  waterTemp: "n/a",
  enclosure: "n/a",
  state: "n/a",
  province: "n/a",
  culture: "n/a",
  religion: "n/a",
  burg: "n/a",
  danger: "n/a",
  extra: {},
  isPinned: false,
  togglePinned: () => set(state => ({ isPinned: !state.isPinned })),
  updateInfo: ({ extra, ...data }) =>
    set(state => ({ ...state, ...data, extra: extra ? { ...state.extra, ...extra } : state.extra }))
}));
