import { worldContext } from "../context/worldContext";
import type { ChartData } from "../renderers/elevation-profile-renderer";
import { getHeight } from "../services/cellInfoService";
import { buildRouteGradeProfile, type RouteGradeProfile } from "../services/routeGrade";
import { tip } from "../services/tooltipService";
import { useElevationProfileState } from "../store/elevationProfileState";
import { useOptionsState } from "../store/optionsState";
import type { PackedGraphFeature } from "../types/models";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { normalizeHeightExponent } from "../utils/height";

export interface ElevationChartData {
  chartData: ChartData;
  totalAscent: number;
  totalDescent: number;
}

/**
 * Per-cell chart data (heights/biome/burg markers) + total ascent/descent for a cell path.
 * Shared by the Rivers/Routes elevation-profile dialog (openElevationProfile below) and the
 * burg-to-burg Directions dialog (src/services/travelDirections.ts), so the two don't drift.
 */
export function buildElevationChartData(cells: number[], isRiver: boolean): ElevationChartData | null {
  const firstCell = cells[0];
  const lastCell = cells.at(-1);
  if (firstCell === undefined || lastCell === undefined) return null;

  let slope = 0;
  if (isRiver) {
    const firstH = worldContext.pack.cells.h[firstCell];
    const lastH = worldContext.pack.cells.h[lastCell];
    if (firstH < lastH) slope = 1;
    else if (firstH > lastH) slope = -1;
  }

  const chartData: ChartData = {
    biome: [] as number[],
    burg: [] as number[],
    cell: [] as number[],
    height: [] as number[],
    mi: 1e6,
    ma: 0,
    mih: 100,
    mah: 0,
    points: [] as [number, number][]
  };

  let totalAscent = 0;
  let totalDescent = 0;
  let lastBurgIndex = 0;
  let lastBurgCell = 0;

  for (let i = 0, prevB = 0, prevH = -1; i < cells.length; i++) {
    const cell = cells[i];
    let h = worldContext.pack.cells.h[cell];

    if (h < 20) {
      const f = worldContext.pack.features[worldContext.pack.cells.f[cell]] as PackedGraphFeature;
      h = f.type === "lake" ? f.height : 20;
    }

    if (prevH !== -1 && isRiver) {
      if (slope === 1 && h < prevH) h = prevH;
      else if (slope === 0 && h !== prevH) h = prevH;
      else if (slope === -1 && h > prevH) h = prevH;
    }
    prevH = h;

    let b = worldContext.pack.cells.burg[cell];
    if (b === prevB) b = 0;
    else prevB = b;
    if (b) {
      lastBurgIndex = i;
      lastBurgCell = cell;
    }

    chartData.biome[i] = worldContext.pack.cells.biomeCode[cell];
    chartData.burg[i] = b;
    chartData.cell[i] = cell;
    const sh = getHeight(h);
    chartData.height[i] = parseInt(sh, 10);
    chartData.mih = Math.min(chartData.mih, h);
    chartData.mah = Math.max(chartData.mah, h);
    chartData.mi = Math.min(chartData.mi, chartData.height[i]);
    chartData.ma = Math.max(chartData.ma, chartData.height[i]);
  }

  for (let i = 1; i < cells.length; i++) {
    const diff = chartData.height[i] - chartData.height[i - 1];
    if (diff > 0) totalAscent += diff;
    else totalDescent -= diff;
  }

  if (lastBurgIndex !== 0 && lastBurgCell === chartData.cell[cells.length - 1] && lastBurgIndex < cells.length - 1) {
    chartData.burg[cells.length - 1] = chartData.burg[lastBurgIndex];
    chartData.burg[lastBurgIndex] = 0;
  }

  return { chartData, totalAscent, totalDescent };
}

/** Land routes only: grade profile uses planar cell spacing + pack heights (meters). */
export function buildGradeProfileForCells(cells: number[]): RouteGradeProfile | null {
  if (cells.length < 2) return null;

  const p = worldContext.pack.cells.p;
  const segmentLengthsMapUnits: number[] = [];
  for (let i = 0; i < cells.length - 1; i++) {
    const [x1, y1] = p[cells[i]];
    const [x2, y2] = p[cells[i + 1]];
    segmentLengthsMapUnits.push(Math.hypot(x2 - x1, y2 - y1));
  }
  const { heightExponent, distanceScale: optionDistanceScale } = useOptionsState.getState();
  return buildRouteGradeProfile(cells, segmentLengthsMapUnits, {
    distanceScale: worldContext.distanceScale || optionDistanceScale || 1,
    heightExponent: normalizeHeightExponent(heightExponent),
    heights: worldContext.pack.cells.h
  });
}

export function openElevationProfile(cells: number[], routeLen: number, isRiver: boolean): void {
  const built = buildElevationChartData(cells, isRiver);
  if (!built) {
    tip("Elevation profile: no data", true, "error");
    return;
  }
  const { chartData, totalAscent, totalDescent } = built;

  const gradeProfile = isRiver ? null : buildGradeProfileForCells(cells);

  useElevationProfileState.getState().open({ chartData, cells, routeLen, totalAscent, totalDescent, gradeProfile });
  closeDialogs("#elevationProfile, .stable");
  openDialog("elevationProfile");
}
