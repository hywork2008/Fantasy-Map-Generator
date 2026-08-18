import { getRailwayLinks } from "../economyContext";

/** 1 = no railway, <1 faster. Used by tradeRouteDuration for market-to-market legs. */
export function getRailwayTravelMultiplier(fromMarketId: number, toMarketId: number): number {
  if (!fromMarketId || !toMarketId || fromMarketId === toMarketId) return 1;
  const link = getRailwayLinks().find(
    entry =>
      entry.utilization > 0.25 &&
      ((entry.fromMarketId === fromMarketId && entry.toMarketId === toMarketId) ||
        (entry.fromMarketId === toMarketId && entry.toMarketId === fromMarketId))
  );
  if (!link) return 1;
  return Math.max(0.35, 1 - 0.55 * link.utilization);
}
