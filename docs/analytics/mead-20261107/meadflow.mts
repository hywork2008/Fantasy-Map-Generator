/**
 * Where a map's Honey and Mead go (docs/analytics/mead-20261107.md). Read-only: a goods-flow observer
 * sums every recorded Honey and Mead flow by direction and category per month, with each good's
 * market stock, stock-weighted price and the household ledgers' demand left unmet at each month's end.
 *
 *   npx tsx docs/analytics/mead-20261107/meadflow.mts <map.fmg> <out.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";

const NAMES = ["Honey", "Mead"] as const;
const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const goods = NAMES.map(name => getGoods().find(good => good.name === name)!);
const nameById = new Map(goods.map(good => [good.i, good.name]));
let flows: Record<string, Record<string, number>> = {};
setGoodFlowObserver(flow => {
  const name = nameById.get(flow.goodId);
  if (!name) return;
  const key = `${flow.direction}:${flow.category}`;
  flows[name] ??= {};
  flows[name][key] = (flows[name][key] ?? 0) + flow.units;
});
const snapshots = [];
const lastLedger: Record<string, { household: number; unmet: number }> = {};
for (let month = 1; month <= months; month++) {
  flows = {};
  await advanceWorld(host, { months: 1 });
  const goodsRow: Record<string, unknown> = {};
  for (const good of goods) {
    let stock = 0;
    let value = 0;
    let marketsWithStock = 0;
    let household = 0;
    let unmet = 0;
    for (const market of getMarkets()) {
      const row = market.goods[good.i];
      const ledger = market.foodProcessingLedger?.[good.name as "Honey" | "Mead"];
      household += ledger?.householdConsumption ?? 0;
      unmet += ledger?.unmetDemand ?? 0;
      if (!row) continue;
      stock += row.stock;
      value += row.stock * row.price;
      if (row.stock > 0.5) marketsWithStock++;
    }
    const last = lastLedger[good.name] ?? { household: 0, unmet: 0 };
    lastLedger[good.name] = { household, unmet };
    goodsRow[good.name] = {
      flows: flows[good.name] ?? {},
      stock,
      price: stock > 0 ? value / stock : 0,
      marketsWithStock,
      householdThisMonth: household - last.household,
      unmetThisMonth: unmet - last.unmet
    };
  }
  snapshots.push({ month, markets: getMarkets().length, goods: goodsRow });
  writeFileSync(
    output,
    JSON.stringify({ input, values: Object.fromEntries(goods.map(good => [good.name, good.value])), snapshots })
  );
  console.log(`[meadflow] ${input} month ${month}`);
}
setGoodFlowObserver(null);
process.exit(0);
