import { mean } from "d3";
import { worldContext } from "../context/worldContext";
import { gauss, rn } from "../utils";

/**
 * Redistributes rural population among `cellIds` (e.g. one state or province's cells) using
 * the same suitability-based formula as rankCells() in main.ts, with fresh randomization so
 * the distribution actually looks different — while rescaling the result so the scope's total
 * rural population (sum of cells.pop) is preserved exactly, subject to float rounding.
 */
export function redistributeRuralPopulationInScope(cellIds: Iterable<number>): void {
  const { cells } = worldContext.pack;
  const ids = Array.from(cellIds);
  if (!ids.length) return;

  const oldTotal = ids.reduce((sum, i) => sum + cells.pop[i], 0);
  const meanArea = mean(cells.area) ?? 1;

  const raw = new Float64Array(ids.length);
  let rawSum = 0;
  ids.forEach((i, index) => {
    const value = cells.s[i] > 0 ? ((cells.s[i] * cells.area[i]) / meanArea) * gauss(1, 1, 0.5, 2, 3) : 0;
    raw[index] = value;
    rawSum += value;
  });

  const scale = rawSum > 0 ? oldTotal / rawSum : 0;
  ids.forEach((i, index) => {
    cells.pop[i] = rn(raw[index] * scale, 4);
  });
}
