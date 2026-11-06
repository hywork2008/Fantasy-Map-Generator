import type { Market } from "./marketTypes";

/**
 * Takes `units` of a good out of the market's consignment from its towns without paying for them:
 * households took them from stock without paying (Simulation settings `householdGoodsPayment`
 * `free`), so nothing came in to pay the towns with, and the market owes nothing for them. Consigned
 * goods leave stock first, as in `Markets.settleCraftConsignments`. Returns the units released
 * (docs/plan/market-goods-settlement.md §2.2).
 */
export function releaseConsignedUnpaid(market: Market, goodId: number, units: number): number {
  const byBurg = market.marketTreasury?.craftConsigned?.[goodId];
  if (!byBurg || !(units > 0)) return 0;
  const rows = Object.entries(byBurg);
  const consigned = rows.reduce((total, [, row]) => total + row[0], 0);
  if (!(consigned > 0)) return 0;
  const released = Math.min(consigned, units);
  const keep = 1 - released / consigned;
  for (const [burgIdStr, row] of rows) {
    if (keep > 1e-12) byBurg[+burgIdStr] = [row[0] * keep, Math.round(row[1] * keep * 100) / 100];
    else delete byBurg[+burgIdStr];
  }
  if (!Object.keys(byBurg).length) delete market.marketTreasury!.craftConsigned![goodId];
  return released;
}
