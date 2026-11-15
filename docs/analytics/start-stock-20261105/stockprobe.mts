/**
 * Market stock and monthly use of every good (docs/plan/start-provisioning.md §6.2, P1).
 * Read-only: each month records, per market and good, the closing stock, the units the market's
 * flows sank (split into use and spoilage/theft), local and imported sources, and the price.
 * Raids off; peace via env.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/start-stock-20261105/stockprobe.mts <map.fmg> <out.json> [months=60]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getMarketCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";

const [input, output, monthsArg = "60"] = process.argv.slice(2);
const r2 = (v: number) => Math.round((v ?? 0) * 100) / 100;
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
{
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-caravan-raids": "off" };
}

const LOSS = new Set(["spoilage", "theft"]);
// [use, loss, localSource, imported] per "market:good"; flows without a market go to market -1.
let flows = new Map<string, number[]>();
const categories: Record<string, Record<string, number>> = {};
setGoodFlowObserver(flow => {
  if (flow.direction === "transfer") return;
  const key = `${flow.marketId ?? -1}:${flow.goodId}`;
  const row = flows.get(key) ?? [0, 0, 0, 0];
  if (flow.direction === "sink") row[LOSS.has(flow.category) ? 1 : 0] += flow.units;
  else row[flow.category === "importArrival" ? 3 : 2] += flow.units;
  flows.set(key, row);
  const byCat = (categories[`${flow.direction}:${flow.category}`] ??= {});
  byCat[flow.goodId] = (byCat[flow.goodId] ?? 0) + flow.units;
});

function marketPeople(): Map<number, { urban: number; rural: number }> {
  const world = getWorldContext();
  const rate = Math.max(1, world.populationRate ?? 1);
  const marketByCell = getMarketCellColumn();
  const people = new Map<number, { urban: number; rural: number }>();
  const row = (id: number) => {
    let entry = people.get(id);
    if (!entry) people.set(id, (entry = { urban: 0, rural: 0 }));
    return entry;
  };
  const pop = world.pack.cells.pop as ArrayLike<number>;
  for (let c = 0; c < pop.length; c++) if (pop[c] > 0) row(marketByCell[c]).rural += pop[c] * rate;
  for (const burg of world.pack.burgs as { i: number; removed?: boolean; population?: number; market?: number; cell: number }[]) {
    if (!burg?.i || burg.removed) continue;
    row(burg.market ?? marketByCell[burg.cell]).urban += (burg.population ?? 0) * rate;
  }
  return people;
}

const goods = getGoods();
const meta = goods.map(g => ({ i: g.i, name: g.name, value: g.value, tags: g.tags, crop: !!g.crop }));
function snapshot(month: number) {
  const people = marketPeople();
  const markets = getMarkets().map(m => {
    const p = people.get(m.i) ?? { urban: 0, rural: 0 };
    const rows: Record<number, number[]> = {};
    for (const g of goods) {
      const state = m.goods[g.i];
      const f = flows.get(`${m.i}:${g.i}`) ?? [0, 0, 0, 0];
      const stock = state?.stock ?? 0;
      if (!stock && !f.some(Boolean)) continue;
      // [stock, use, loss, localSource, imported, price]
      rows[g.i] = [r2(stock), r2(f[0]), r2(f[1]), r2(f[2]), r2(f[3]), r2(state?.price ?? 0)];
    }
    return { i: m.i, urban: Math.round(p.urban), rural: Math.round(p.rural), goods: rows };
  });
  const unassigned: Record<number, number> = {};
  for (const [key, f] of flows) if (key.startsWith("-1:")) unassigned[Number(key.slice(3))] = r2(f[0]);
  return { month, markets, unassigned };
}

const snapshots = [snapshot(0)];
for (let month = 1; month <= Number(monthsArg); month++) {
  flows = new Map();
  await advanceWorld(host, { months: 1 });
  snapshots.push(snapshot(month));
  process.stderr.write(`[stock] month ${month}\n`);
}
writeFileSync(
  output,
  JSON.stringify({
    input,
    populationRate: getWorldContext().populationRate,
    goods: meta,
    categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([g, u]) => [g, r2(u)]))])),
    snapshots
  })
);
host.dispose();
