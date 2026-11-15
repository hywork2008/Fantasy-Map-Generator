/**
 * Why treeless markets get no Wood, Barrels or Beer by trade (start-stock-20261105.md §9).
 * Read-only: tallies the global trade gates (tradeStageObserver.ts) per good and importer, and
 * each month records the stock, price and trade reserve side of the watched markets.
 * Raids off; peace via env.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/treeless-trade-20261106/tradeprobe.mts <map.fmg> <out.json> [months=24] [markets=7,4,15]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { setTradeStageObserver } from "../../../src/extensions/economy/generators/tradeStageObserver";

const [input, output, monthsArg = "24", marketsArg = "7,4,15"] = process.argv.slice(2);
const watched = new Set(marketsArg.split(",").map(Number));
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
{
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-caravan-raids": "off" };
}
const names = ["Wood", "Barrels", "Beer", "Barley", "Oats"];
const goods = getGoods().filter(g => names.includes(g.name));
const ids = new Map(goods.map(g => [g.i, g.name]));
// "good>importer" -> stage[:reason] -> count; deals carry units.
const gates: Record<string, Record<string, number>> = {};
const pairs: Record<string, Record<string, number>> = {};
let month = 0;
setTradeStageObserver(event => {
  const name = ids.get(event.goodId);
  if (!name || !watched.has(event.importerId)) return;
  const stage = event.reason ? `${event.stage}:${event.reason}` : event.stage;
  const row = (gates[`${name}>${event.importerId}`] ??= {});
  row[stage] = (row[stage] ?? 0) + (event.stage === "deal" ? (event.units ?? 0) : 1);
  const pr = (pairs[`${name}>${event.importerId}<${event.exporterId}`] ??= {});
  pr[stage] = (pr[stage] ?? 0) + 1;
});
const monthly: unknown[] = [];
const months = Number(monthsArg);
for (month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const rows = getMarkets().map(m => ({
    i: m.i,
    goods: Object.fromEntries(goods.map(g => [g.name, [Math.round(m.goods[g.i]?.stock ?? 0), Math.round((m.goods[g.i]?.price ?? 0) * 100) / 100]]))
  }));
  monthly.push({ month, rows });
  console.log(`month ${month}`);
}
setTradeStageObserver(null);
writeFileSync(output, JSON.stringify({ input, months, watched: [...watched], gates, pairs, monthly }));
