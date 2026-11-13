/**
 * Drinks and their containers (docs/analytics/drink-containers-20261107.md). Read-only: a goods-flow
 * observer sums each month the casks, pots and bottles bought for drink recipes by drink and
 * container, the containers put back in stock, and the drinks' household use and unmet demand; at
 * each month's end it sums the markets' container stock, price and circulation (when present).
 *
 *   npx tsx docs/analytics/drink-containers-20261107/containerflow.mts <map.fmg> <out.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";

const DRINKS = ["Beer", "Wine", "Cider", "Perry", "Mead"];
const CONTAINERS = ["Barrels", "Ceramics", "Glass"];
const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const byName = new Map(getGoods().map(good => [good.name, good]));
const nameById = new Map(getGoods().map(good => [good.i, good.name]));
let flows: Record<string, number> = {};
setGoodFlowObserver(flow => {
  const name = nameById.get(flow.goodId) ?? "";
  if (CONTAINERS.includes(name)) {
    const related = flow.relatedGoodId !== undefined ? (nameById.get(flow.relatedGoodId) ?? "") : "";
    const key = `${name}:${flow.direction}:${flow.category}${related ? `:${related}` : ""}`;
    flows[key] = (flows[key] ?? 0) + flow.units;
  } else if (DRINKS.includes(name)) {
    const key = `${name}:${flow.direction}:${flow.category}`;
    flows[key] = (flows[key] ?? 0) + flow.units;
  }
});
const last: Record<string, { household: number; unmet: number }> = {};
const snapshots = [];
for (let month = 1; month <= months; month++) {
  flows = {};
  await advanceWorld(host, { months: 1 });
  const drinks: Record<string, unknown> = {};
  for (const drink of DRINKS) {
    const good = byName.get(drink);
    if (!good) continue;
    let household = 0;
    let unmet = 0;
    let stock = 0;
    for (const market of getMarkets()) {
      const ledger = (market.foodProcessingLedger as Record<string, { householdConsumption: number; unmetDemand: number }> | undefined)?.[drink];
      household += ledger?.householdConsumption ?? 0;
      unmet += ledger?.unmetDemand ?? 0;
      stock += market.goods[good.i]?.stock ?? 0;
    }
    const previous = last[drink] ?? { household: 0, unmet: 0 };
    last[drink] = { household, unmet };
    drinks[drink] = { household: household - previous.household, unmet: unmet - previous.unmet, stock };
  }
  const containers: Record<string, unknown> = {};
  for (const name of CONTAINERS) {
    const good = byName.get(name);
    if (!good) continue;
    let stock = 0;
    let value = 0;
    const circulation = { empties: 0, filled: 0, shipped: 0, reused: 0, bought: 0, lost: 0, released: 0 };
    for (const market of getMarkets()) {
      const row = market.goods[good.i];
      if (row) {
        stock += row.stock;
        value += row.stock * row.price;
      }
      // biome-ignore lint/suspicious/noExplicitAny: the field is absent before the change.
      const c = (market.returnableContainerLedger as any)?.circulation;
      if (!c) continue;
      circulation.empties += c.empties[name] ?? 0;
      for (const drink of DRINKS) {
        circulation.filled += c.filled[drink]?.[name] ?? 0;
        circulation.shipped += c.shipped[drink]?.[name] ?? 0;
      }
      circulation.reused += c.reused[name] ?? 0;
      circulation.bought += c.bought[name] ?? 0;
      circulation.lost += c.lost[name] ?? 0;
      circulation.released += c.released[name] ?? 0;
    }
    containers[name] = { stock, price: stock > 0 ? value / stock : 0, circulation };
  }
  snapshots.push({ month, flows, drinks, containers });
  writeFileSync(output, JSON.stringify({ input, snapshots }));
  console.log(`[containerflow] ${input} month ${month}`);
}
setGoodFlowObserver(null);
process.exit(0);
