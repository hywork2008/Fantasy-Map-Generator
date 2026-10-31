/**
 * Fodder price month by month: per Market, after each month, the Fodder price and stock, the farms'
 * monthly Fodder orders and the rolling annual use. FMG_HAY_TRADE picks the hay trade mode.
 * Usage: fodderprice.mts <archive.fmg> <output.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getGoods, getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getLivestockFodderOrderLots } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/livestockFeed";
import { getMarketSettings, setMarketSettings } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/marketSettings";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";

const [input, output, length = "24"] = process.argv.slice(2);
const months = Number(length);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
if (process.env.FMG_HAY_TRADE) setMarketSettings({ hayTrade: process.env.FMG_HAY_TRADE as never });
console.log("hayTrade", getMarketSettings().hayTrade);
const rows: unknown[] = [];
for (let m = 1; m <= months; m++) {
  await advanceWorld(host, { months: 1 });
  const fodder = getGoods().find(good => good.name === "Fodder")!;
  const markets: Record<number, unknown> = {};
  for (const market of getMarkets()) {
    const g = market.goods[fodder.i];
    markets[market.i] = {
      price: g?.price ?? 0,
      stock: Math.round(g?.stock ?? 0),
      orders: Math.round(getLivestockFodderOrderLots(market)),
      annualUse: Math.round(market.foodLedger?.fodderAnnualUseLots ?? 0)
    };
  }
  rows.push({ month: m, value: fodder.value, markets });
  writeFileSync(output, JSON.stringify({ months: m, rows }));
  console.log("month", m);
}
host.dispose();
