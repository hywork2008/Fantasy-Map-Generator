import type { WorldContext } from "../../hostCore";
import { getMarketCellColumn } from "../economyContext";

/** Actual rural people (population points × populationRate) attributed to a market's cells. */
export function getMarketRuralPopulation(worldContext: Readonly<WorldContext>, marketId: number): number {
  const { pack } = worldContext;
  const marketCellColumn = getMarketCellColumn();
  const populationRate = worldContext.populationRate ?? 1000;
  let ruralPopulation = 0;
  for (const cellId of pack.cells.i) {
    if (marketCellColumn[cellId] !== marketId || pack.cells.h[cellId] < 20) continue;
    ruralPopulation += pack.cells.pop[cellId] * populationRate;
  }
  return ruralPopulation;
}
