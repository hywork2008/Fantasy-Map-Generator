/**
 * By-product prices by market (docs/analytics/byproduct-prices-20261111.md). Records every month,
 * for each market, the stock and price over base value of the leather goods and the other
 * by-products, so a stock-weighted price can be read beside the plain mean of goods.mts.
 *
 *   npx tsx docs/analytics/byproduct-prices-20261111/markets.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getSimulationMonth } from "../../../src/extensions/economy/economyContext";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";

const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const NAMES = ["Leather", "Tallow", "Boots", "Leather Goods", "Harnesses", "Pomace Wine", "Camels", "Cattle"];
const goods = getGoods().filter(good => NAMES.includes(good.name));
const r2 = (value: number) => Math.round(value * 100) / 100;
const snapshots = [];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const rows: Record<string, [number, number, number][]> = {};
  for (const good of goods) {
    rows[good.name] = getMarkets()
      .filter(market => market?.goods?.[good.i])
      .map(market => {
        const row = market.goods[good.i];
        return [market.i, r2(Math.max(0, row.stock ?? 0)), r2((row.price ?? 0) / (good.value || 1))];
      });
  }
  snapshots.push({ month, calendarMonth: getSimulationMonth(), rows });
  writeFileSync(output, JSON.stringify({ input, snapshots }));
  console.log(`[markets] ${input} month ${month}`);
}
process.exit(0);
