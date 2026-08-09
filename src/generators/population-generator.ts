import { worldContext } from "../context/worldContext";
import { gauss, rn } from "../utils";
import { getCellSubsistenceCapacity } from "./subsistenceCapacity";

/**
 * Redistributes rural population among `cellIds` (e.g. one state or province's cells) using
 * food-derived capacity with fresh randomization so the distribution actually looks different —
 * while rescaling the result so the scope's total rural population (sum of cells.pop) is preserved
 * exactly, subject to float rounding.
 */
export function redistributeRuralPopulationInScope(cellIds: Iterable<number>): void {
  const { cells } = worldContext.pack;
  const ids = Array.from(cellIds);
  if (!ids.length) return;

  const oldTotal = ids.reduce((sum, i) => sum + cells.pop[i], 0);
  const raw = new Float64Array(ids.length);
  let rawSum = 0;
  ids.forEach((i, index) => {
    const capacity = getCellSubsistenceCapacity(cells, i);
    const value = cells.s[i] > 0 && capacity > 0 ? capacity * gauss(1, 1, 0.5, 2, 3) : 0;
    raw[index] = value;
    rawSum += value;
  });

  const scale = rawSum > 0 ? oldTotal / rawSum : 0;
  ids.forEach((i, index) => {
    const oldPop = cells.pop[i];
    const newPop = rn(raw[index] * scale, 4);
    cells.pop[i] = newPop;

    const ratio = oldPop > 0 ? newPop / oldPop : 0;
    if (ratio !== 1 && ratio !== 0) {
      cells.children[i] = rn(cells.children[i] * ratio, 4);
      cells.maleAdults[i] = rn(cells.maleAdults[i] * ratio, 4);
      cells.femaleAdults[i] = rn(cells.femaleAdults[i] * ratio, 4);
      cells.elders[i] = rn(cells.elders[i] * ratio, 4);
    } else if (oldPop === 0 && newPop > 0) {
      cells.children[i] = newPop * 0.4;
      cells.maleAdults[i] = newPop * 0.2205;
      cells.femaleAdults[i] = newPop * 0.2295;
      cells.elders[i] = newPop * 0.15;
    }
  });
}
