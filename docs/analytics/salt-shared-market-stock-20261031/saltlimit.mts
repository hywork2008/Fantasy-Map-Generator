/** Which limit binds each saltworks order: demand, capacity, buyer cash, owner cash, labour, fuel. */
import { readFileSync } from "node:fs";
import { getMarkets, getGoods } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getSaltworks } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/industry";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const months = Number(process.argv[3] ?? 12);
let pendingOrder: any = null;
type Acc = Record<string, number>;
let acc: Acc = {}; let byWorks: Record<number, Acc> = {};
let unordered = 0;
(globalThis as any).__saltDiag = (r: any) => {
  if (r.kind === "order") { pendingOrder = r; return; }
  const o = pendingOrder; pendingOrder = null; if (!o) return;
  // Shortfall against the buyer's remaining need, attributed to the tightest limit.
  const limits: Record<string, number> = { capacity: o.remainingCapacity, buyerCash: o.buyerCash, ownerCash: r.cashLimit, labour: r.labour, fuel: r.fuel };
  const gap = Math.max(0, o.remaining - r.output);
  const [bind] = Object.entries(limits).sort((a, b) => a[1] - b[1]);
  const key = gap > 1e-6 ? bind[0] : "met";
  acc[key] = (acc[key] ?? 0) + (key === "met" ? r.output : gap);
  acc.output = (acc.output ?? 0) + r.output;
  const w = (byWorks[o.works] ??= {}); w[key] = (w[key] ?? 0) + (key === "met" ? r.output : gap);
};
const out: unknown[] = [];
for (let m = 1; m <= months; m++) {
  acc = {}; byWorks = {};
  await advanceWorld(host, { months: 1 });
  const works = getSaltworks().filter(w => w.active);
  const cap = works.reduce((s, w) => s + (w.monthlyCapacityBags ?? 0), 0);
  const outp = works.reduce((s, w) => s + (w.monthlyOutputBags ?? 0), 0);
  const salt = getGoods().find(g => g.name === "Salt")!;
  const stock = getMarkets().reduce((s, mk) => s + (mk.goods[salt.i]?.stock ?? 0), 0);
  // Capacity left idle with no order reaching it.
  const idle = works.reduce((s, w) => s + Math.max(0, (w.monthlyCapacityBags ?? 0) - (w.monthlyOutputBags ?? 0)), 0);
  const topLabour = Object.entries(byWorks).filter(([, a]) => (a.labour ?? 0) > 0).map(([i, a]) => { const w = works.find(x => x.i === +i); return { works: +i, market: w?.marketId, method: w?.productionMethod, labourGap: Math.round(a.labour) }; }).sort((a, b) => b.labourGap - a.labourGap).slice(0, 8);
  out.push({ month: m, cap: Math.round(cap), output: Math.round(outp), idle: Math.round(idle), stock: Math.round(stock), gapByLimit: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, Math.round(v)])), topLabour });
  process.stderr.write(`[salt] ${m}/${months}\n`);
}
console.log(JSON.stringify(out));
host.dispose();
