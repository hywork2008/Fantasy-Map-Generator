/**
 * Where a map's Honey goes (docs/analytics/honey-biome-20261107.md). Read-only: a goods-flow observer
 * sums every recorded Honey flow by direction and category per month, with the markets' Honey stock
 * and the stock-weighted price at each month's end.
 *
 *   npx tsx docs/analytics/honey-biome-20261107/honeyflow.mts <map.fmg> <out.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";

const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const honey = getGoods().find(good => good.name === "Honey")!;
let flows: Record<string, number> = {};
setGoodFlowObserver(flow => {
  if (flow.goodId !== honey.i) return;
  const key = `${flow.direction}:${flow.category}`;
  flows[key] = (flows[key] ?? 0) + flow.units;
});
const snapshots = [];
for (let month = 1; month <= months; month++) {
  flows = {};
  await advanceWorld(host, { months: 1 });
  let stock = 0;
  let value = 0;
  let marketsWithStock = 0;
  for (const market of getMarkets()) {
    const row = market.goods[honey.i];
    if (!row) continue;
    stock += row.stock;
    value += row.stock * row.price;
    if (row.stock > 0.5) marketsWithStock++;
  }
  snapshots.push({ month, flows, stock, price: stock > 0 ? value / stock : 0, markets: getMarkets().length, marketsWithStock });
  writeFileSync(output, JSON.stringify({ input, honeyValue: honey.value, snapshots }));
  console.log(`[honeyflow] ${input} month ${month}`);
}
setGoodFlowObserver(null);
process.exit(0);
