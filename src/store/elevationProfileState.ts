import { create } from "zustand";
import type { ChartData } from "../renderers/elevation-profile-renderer";

interface ElevationProfileState {
  chartData: ChartData | null;
  cells: number[];
  routeLen: number;
  totalAscent: number;
  totalDescent: number;
  open: (data: {
    chartData: ChartData;
    cells: number[];
    routeLen: number;
    totalAscent: number;
    totalDescent: number;
  }) => void;
  reset: () => void;
}

export const useElevationProfileState = create<ElevationProfileState>(set => ({
  chartData: null,
  cells: [],
  routeLen: 0,
  totalAscent: 0,
  totalDescent: 0,
  open: data => set(data),
  reset: () => set({ chartData: null, cells: [], routeLen: 0, totalAscent: 0, totalDescent: 0 })
}));
