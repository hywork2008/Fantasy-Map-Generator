import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import type { Market } from "./marketTypes";

/**
 * The smallest population weight a Burg receives when its Market allocates this
 * cycle's producer-purchase cash. It keeps a hamlet economically alive without
 * letting an arbitrary number of tiny Burgs outrank a town as a group.
 */
const MINIMUM_BURG_PROCUREMENT_WEIGHT = 0.5;

/**
 * Reserves a Market's current producer-purchase cash before any Burg is produced.
 * A shared Market balance must not become a first-come, first-served race merely
 * because production happens to visit villages before cities.
 */
export function allocateMarketProcurementBudgets(
  burgs: readonly Burg[],
  markets: readonly Market[]
): ReadonlyMap<number, number> {
  const marketById = new Map(
    markets.filter((market): market is Market => Boolean(market)).map(market => [market.i, market])
  );
  const burgsByMarket = new Map<number, Burg[]>();

  for (const burg of burgs) {
    if (!burg.i || burg.removed || !burg.market) continue;
    const market = marketById.get(burg.market);
    if (!market?.marketTreasury) continue;
    const group = burgsByMarket.get(market.i);
    if (group) group.push(burg);
    else burgsByMarket.set(market.i, [burg]);
  }

  const budgets = new Map<number, number>();
  for (const [marketId, marketBurgs] of burgsByMarket) {
    const market = marketById.get(marketId)!;
    const maintenanceReach = 0.25 + 0.75 * (market.maintenanceCondition ?? 1);
    const available = rn(Math.max(0, market.marketTreasury!.balance) * maintenanceReach, 2);
    if (!(available > 0)) continue;

    const totalWeight = marketBurgs.reduce(
      (sum, burg) => sum + Math.max(MINIMUM_BURG_PROCUREMENT_WEIGHT, burg.population ?? 0),
      0
    );
    let remaining = available;
    const ordered = [...marketBurgs].sort((a, b) => a.i! - b.i!);
    for (const [index, burg] of ordered.entries()) {
      const budget =
        index === ordered.length - 1
          ? remaining
          : rn((available * Math.max(MINIMUM_BURG_PROCUREMENT_WEIGHT, burg.population ?? 0)) / totalWeight, 2);
      budgets.set(burg.i!, budget);
      remaining = rn(Math.max(0, remaining - budget), 2);
    }
  }

  return budgets;
}
