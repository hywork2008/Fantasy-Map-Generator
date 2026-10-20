/**
 * The share of a market's local carriers free to hire in a month (docs/plan/
 * port-freight-queue-and-warehouses.md §3.3, §10.27). Peasants carted for hire between field work:
 * Shinano's chūma were a by-employment of the farm's slack months (農間), and at harvest their
 * beasts and hands went to the fields. The month the market's countryside reaps most leaves half
 * the teams free, other months in proportion to their harvest. Threshing in the barn is left out:
 * it kept the household indoors in winter, the carting season.
 */

import { getMarketCellColumn, getSimulationYear, getWorldContext } from "../economyContext";
import { isLongDistanceTradeEnabled } from "./merchantTradeCapital";
import { getCellHarvestWeights } from "./production-utils";

/** Share of the local carriers free in the month of the main harvest. */
export const HARVEST_HIRE_FACTOR = 0.5;

let cachedYear: number | null = null;
let cachedPack: unknown = null;
let profiles = new Map<number, number[] | null>();

/** Harvest month weights of the market's countryside, weighted by its rural people. */
function marketHarvest(marketId: number): number[] | null {
  const world = getWorldContext();
  const year = getSimulationYear();
  if (cachedYear !== year || cachedPack !== world.pack) {
    profiles = new Map();
    cachedYear = year;
    cachedPack = world.pack;
  }
  if (profiles.has(marketId)) return profiles.get(marketId) ?? null;
  const cells = world.pack.cells;
  const column = getMarketCellColumn();
  const weights = new Array<number>(12).fill(0);
  let people = 0;
  for (const cellId of cells?.i ?? []) {
    if (column[cellId] !== marketId || cells.h[cellId] < 20 || !(cells.pop[cellId] > 0)) continue;
    const cell = getCellHarvestWeights(cellId);
    if (!cell) continue;
    for (let month = 0; month < 12; month++) weights[month] += cells.pop[cellId] * cell[month];
    people += cells.pop[cellId];
  }
  const profile = people > 0 ? weights.map(weight => weight / people) : null;
  profiles.set(marketId, profile);
  return profile;
}

/** Share of the market's hireable carts and teams free from the harvest in `month` (1–12). */
export function getLocalCarrierSeasonFactor(marketId: number, month: number): number {
  if (!isLongDistanceTradeEnabled()) return 1;
  const harvest = marketHarvest(marketId);
  const peak = harvest ? Math.max(...harvest) : 0;
  if (!harvest || !(peak > 0)) return 1;
  return 1 - (1 - HARVEST_HIRE_FACTOR) * ((harvest[month - 1] ?? 0) / peak);
}
