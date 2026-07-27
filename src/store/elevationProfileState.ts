import { create } from "zustand";
import type { ChartData } from "../renderers/elevation-profile-renderer";
import type { RouteGradeProfile } from "../services/routeGrade";

interface ElevationProfileState {
  chartData: ChartData | null;
  cells: number[];
  routeLen: number;
  totalAscent: number;
  totalDescent: number;
  /** Grade profile for land routes; null for rivers / unavailable. */
  gradeProfile: RouteGradeProfile | null;
  open: (data: {
    chartData: ChartData;
    cells: number[];
    routeLen: number;
    totalAscent: number;
    totalDescent: number;
    gradeProfile?: RouteGradeProfile | null;
  }) => void;
  reset: () => void;
}

export const useElevationProfileState = create<ElevationProfileState>(set => ({
  chartData: null,
  cells: [],
  routeLen: 0,
  totalAscent: 0,
  totalDescent: 0,
  gradeProfile: null,
  open: data =>
    set({
      chartData: data.chartData,
      cells: data.cells,
      routeLen: data.routeLen,
      totalAscent: data.totalAscent,
      totalDescent: data.totalDescent,
      gradeProfile: data.gradeProfile ?? null
    }),
  reset: () =>
    set({
      chartData: null,
      cells: [],
      routeLen: 0,
      totalAscent: 0,
      totalDescent: 0,
      gradeProfile: null
    })
}));
