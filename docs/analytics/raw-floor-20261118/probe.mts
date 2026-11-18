/**
 * Why raw rural goods sit at their price floor (docs/analytics/raw-floor-20261118.md): after N months,
 * per good, the market stock against the month's flows (units) by category and direction, and how
 * many markets are at the floor.
 *   npx tsx docs/analytics/raw-floor-20261118/probe.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";
import { setMarketSettings } from "../../../src/simulation/marketSettings";
import { getMarketPriceLevel } from "../../../src/extensions/economy/generators/currencySufficiency";

const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const GOODS = ["Wheat", "Rye", "Barley", "Oats", "Cattle", "Sheep", "Pig", "Goats", "Horses", "Wool", "Wood", "Charcoal", "Honey", "Flax", "Hemp"];
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
setMarketSettings(JSON.parse(process.env.FMG_SETTINGS ?? "{}"));
const byId = new Map(getGoods().map(g => [g.i, g]));
let flows: Record<string, Record<string, number>> = {};
setGoodFlowObserver(flow => {
  const name = byId.get(flow.goodId)?.name;
  if (!name || !GOODS.includes(name) || !(flow.units > 0)) return;
  const row = (flows[name] ??= {});
  const key = `${flow.direction}:${flow.category}`;
  row[key] = (row[key] ?? 0) + flow.units;
});
const out: unknown[] = [];
for (let month = 1; month <= months; month++) {
  flows = {};
  await advanceWorld(host, { months: 1 });
  if (month % 3 !== 0) continue;
  const goods: Record<string, unknown> = {};
  for (const name of GOODS) {
    const good = getGoods().find(g => g.name === name);
    if (!good) continue;
    let stock = 0, atFloor = 0, markets = 0;
    for (const m of getMarkets()) {
      const mg = m?.goods?.[good.i];
      if (!mg) continue;
      markets++;
      stock += Math.max(0, mg.stock ?? 0);
      if (mg.price <= good.value * getMarketPriceLevel(m) * 0.2501) atFloor++;
    }
    goods[name] = { value: good.value, stock, markets, atFloor, flows: flows[name] ?? {} };
  }
  out.push({ month, goods });
  console.log("month", month);
}
writeFileSync(output, JSON.stringify(out));
