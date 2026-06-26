import { worldContext } from "../context/worldContext";
import { useElevationProfileState } from "../store/elevationProfileState";
import type { PackedGraphFeature } from "../types/models";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { getHeight, tip } from "../utils/uiHelpers";

export function openElevationProfile(cells: number[], routeLen: number, isRiver: boolean): void {
  const firstCell = cells[0];
  const lastCell = cells.at(-1);
  if (firstCell === undefined || lastCell === undefined) {
    tip("Elevation profile: no data", true, "error");
    return;
  }

  let slope = 0;
  if (isRiver) {
    const firstH = worldContext.pack.cells.h[firstCell];
    const lastH = worldContext.pack.cells.h[lastCell];
    if (firstH < lastH) slope = 1;
    else if (firstH > lastH) slope = -1;
  }

  const chartData = {
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

    chartData.biome[i] = worldContext.pack.cells.biome[cell];
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

  useElevationProfileState.getState().open({ chartData, cells, routeLen, totalAscent, totalDescent });
  closeDialogs("#elevationProfile, .stable");
  openDialog("elevationProfile");
}
