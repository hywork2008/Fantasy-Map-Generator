/**
 * Casks of the vintage (docs/analytics/vintage-casks-20261110.md). Read-only: a goods-flow observer sums
 * each month the flows of Barrels, Beer, Wine, Cider and Grain by direction, category and, for recipe
 * inputs, the good they went into; at each month's end it sums their stock and the mean price across markets.
 *
 *   npx tsx docs/analytics/vintage-casks-20261110/caskprobe.mts <map.fmg> <out.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";

const NAMES = ["Barrels", "Beer", "Wine", "Cider", "Grain"];
const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 24);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const nameById = new Map(getGoods().map(good => [good.i, good.name]));
let flows: Record<string, number> = {};
setGoodFlowObserver(event => {
  const name = nameById.get(event.goodId);
  if (!name || !NAMES.includes(name)) return;
  const related = event.relatedGoodId !== undefined ? `>${nameById.get(event.relatedGoodId)}` : "";
  const key = `${name}:${event.direction}:${event.category}${related}`;
  flows[key] = (flows[key] ?? 0) + (event.units ?? 0);
});
const snapshots = [];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const stock: Record<string, { stock: number; meanPrice: number }> = {};
  for (const name of NAMES) {
    const good = getGoods().find(candidate => candidate.name === name);
    if (!good) continue;
    let total = 0;
    let price = 0;
    let count = 0;
    for (const market of getMarkets()) {
      const row = market.goods[good.i];
      if (!row) continue;
      total += Math.max(0, row.stock);
      price += row.price;
      count++;
    }
    stock[name] = { stock: total, meanPrice: count ? price / count : 0 };
  }
  snapshots.push({ month, flows, stock });
  flows = {};
  writeFileSync(output, JSON.stringify({ input, snapshots }));
  console.log(`[caskprobe] ${input} month ${month}`);
}
process.exit(0);
