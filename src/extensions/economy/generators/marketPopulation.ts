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

/**
 * Share of each market's land area under forest (`cells.forestCover`, the biome's potential
 * cover, not the standing stock): a land's drink follows its landscape, not a few years' felling.
 */
export function getMarketWoodlandShares(worldContext: Readonly<WorldContext>): Map<number, number> {
  const { cells } = worldContext.pack;
  const column = getMarketCellColumn();
  const forest = new Map<number, number>();
  const land = new Map<number, number>();
  for (const id of cells.i) {
    const market = column[id];
    if (!market || cells.h[id] < 20) continue;
    const area = cells.area?.[id] ?? 1;
    land.set(market, (land.get(market) ?? 0) + area);
    forest.set(market, (forest.get(market) ?? 0) + area * (cells.forestCover?.[id] ?? 0));
  }
  const shares = new Map<number, number>();
  for (const [market, area] of land) shares.set(market, area > 0 ? (forest.get(market) ?? 0) / area : 0);
  return shares;
}
