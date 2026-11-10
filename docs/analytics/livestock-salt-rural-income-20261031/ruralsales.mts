/** Year-one value of rural output entering each market's stock (ruralHarvest), by good, against the rural purse's cash income. */
import { readFileSync } from "node:fs";
import { getMarkets, getGoods } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { setRuralHouseholdWealthFlowObserver } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/householdWealth";
import { setGoodFlowObserver } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/goodsBalanceLedger";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const income = new Map<number, number>();
setRuralHouseholdWealthFlowObserver((m, a) => { if (a > 0) income.set(m, (income.get(m) ?? 0) + a); });
let pending: { m: number; g: number; u: number }[] = [];
setGoodFlowObserver(f => { if (f.direction === "source" && f.category === "ruralHarvest" && f.marketId !== undefined) pending.push({ m: f.marketId, g: f.goodId, u: f.units }); });
const value = new Map<number, Map<string, number>>();
for (let i = 0; i < Number(process.argv[3] ?? 12); i++) {
  pending = [];
  await advanceWorld(host, { months: 1 });
  const goods = getGoods(); const markets = new Map(getMarkets().map(m => [m.i, m]));
  for (const p of pending) {
    const g = goods.find(x => x.i === p.g); const mk = markets.get(p.m); if (!g || !mk) continue;
    const price = mk.goods[g.i]?.price ?? g.value;
    const row = value.get(p.m) ?? new Map(); value.set(p.m, row);
    row.set(g.name, (row.get(g.name) ?? 0) + p.u * price);
  }
}
const world = new Map<string, number>();
for (const [m, row] of value) {
  const total = [...row.values()].reduce((a, b) => a + b, 0);
  for (const [k, v] of row) world.set(k, (world.get(k) ?? 0) + v);
  const top = [...row.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${Math.round(v)}`);
  console.log(JSON.stringify({ market: m, ruralIncome: Math.round(income.get(m) ?? 0), harvestValue: Math.round(total), top }));
}
console.log(JSON.stringify({ world: [...world.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k}:${Math.round(v)}`), ruralIncome: Math.round([...income.values()].reduce((a, b) => a + b, 0)) }));
host.dispose();
