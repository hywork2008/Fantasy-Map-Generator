import { getWorldContext } from "../economyContext";
import type { Market } from "./marketTypes";

/**
 * Burg-weighted state apportionment for a market's territory (docs/temp/profits.md decision #3 —
 * burg-based rather than cell-based, to keep this cheap enough to run every production cycle).
 * Returns 0..1 shares per state id, summing to 1 (or empty if the market has no attributable burgs).
 */
export function getMarketStateShares(market: Market): Map<number, number> {
  const { pack } = getWorldContext();
  const weightByState = new Map<number, number>();
  let totalWeight = 0;

  for (const burg of pack.burgs) {
    if (!burg.i || burg.removed || burg.market !== market.i || !burg.state) continue;
    const weight = burg.population || 0;
    weightByState.set(burg.state, (weightByState.get(burg.state) || 0) + weight);
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    // No population signal from member burgs (e.g. all zero-population) — fall back to
    // attributing the whole market to the center burg's state, if it has one.
    const centerBurg = pack.burgs[market.centerBurgId];
    if (centerBurg?.state) return new Map([[centerBurg.state, 1]]);
    return weightByState;
  }

  const shares = new Map<number, number>();
  for (const [stateId, weight] of weightByState) shares.set(stateId, weight / totalWeight);
  return shares;
}
