/**
 * Start stock for goods whose markets settle holding months of their use (start-provisioning.md
 * §6.6). Their price follows demand over stock (marketPricing.ts), so a market that opened with
 * almost none paid about twice the value until the stock built up, for nearly two years (Iron Ingot,
 * start-stock-20261105.md §2). The first pricing after world birth fills each market's stock to
 * its own modelled demand, where the price stands at the value.
 */
import { getEconomySlice } from "../context/economyApi";

/** Saved in the economy slice until the first pricing has seeded the stock. */
export const START_LINE_STOCK_PENDING_KEY = "startLineStockPending";

/**
 * Goods that opened far above their settled price (start-stock-20261105.md §2, P1). Copper Ingot did
 * too, but in two markets only: seeded everywhere, it stayed priced at 1.5 times where no furnace
 * made it (start-stock-20261105.md §7.2).
 */
export const START_LINE_STOCK_GOODS: ReadonlySet<string> = new Set(["Iron Ingot", "Harnesses"]);

/**
 * Stock as a multiple of the market's modelled monthly demand. 1 opens at the value; a famine or
 * plenty start would scale it (start-provisioning.md §6.3, P3).
 */
export const START_LINE_STOCK_FACTOR = 1;

/** Asks the next market pricing to seed the start stock. */
export function markStartLineStockPending(): void {
  const slice = getEconomySlice();
  if (slice) slice[START_LINE_STOCK_PENDING_KEY] = true;
}

/** True once, for the pricing that should seed; clears the request. */
export function takeStartLineStockPending(): boolean {
  const slice = getEconomySlice();
  if (!slice?.[START_LINE_STOCK_PENDING_KEY]) return false;
  delete slice[START_LINE_STOCK_PENDING_KEY];
  return true;
}

/** Fills a market's stock of a start-line good up to its modelled demand; never takes stock away. */
export function seedStartLineStock(marketGood: { stock: number }, demand: number): void {
  if (!(demand > 0)) return;
  marketGood.stock = Math.max(marketGood.stock, Math.round(demand * START_LINE_STOCK_FACTOR * 100) / 100);
}
