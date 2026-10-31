/**
 * Where market Fodder goes: every recorded Fodder flow (goodsBalanceLedger observer), summed by
 * direction:category, per Market and year. FMG_HAY_TRADE picks the hay trade mode.
 * Usage: fodderflow.mts <archive.fmg> <output.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getGoods } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/goodsBalanceLedger";
import { setMarketSettings, getMarketSettings } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/marketSettings";
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
let flows: Record<string, Record<string, number>> = {};
const years: unknown[] = [];
setGoodFlowObserver(flow => {
  const fodder = getGoods().find(good => good.name === "Fodder");
  if (!fodder || flow.goodId !== fodder.i) return;
  const row = (flows[flow.marketId ?? -1] ??= {});
  const key = `${flow.direction}:${flow.category}`;
  row[key] = (row[key] ?? 0) + flow.units;
});
for (let m = 1; m <= months; m++) {
  await advanceWorld(host, { months: 1 });
  if (m % 12 === 0) {
    years.push({ month: m, flows });
    flows = {};
    writeFileSync(output, JSON.stringify({ months: m, years }));
  }
  console.log("month", m);
}
host.dispose();
