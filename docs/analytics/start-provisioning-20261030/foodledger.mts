/** Food Ledger probe: real staple stock vs the harvest-bridge reserve, and the monthly shortfall. */
import { readFileSync } from "node:fs";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const months = Number(process.argv[3] ?? 24);
const out: Record<string, unknown>[] = [];
const snap = (month: number) => {
  const t = { stock: 0, reserve: 0, exportable: 0, overflow: 0, urbanNeed: 0, urbanSupplied: 0, urbanStockGap: 0, urbanBudgetGap: 0, ruralNeed: 0, ruralSupplied: 0, ruralFromHousehold: 0, annualNeedMonth: 0 };
  let belowReserve = 0, belowOneMonth = 0, n = 0;
  const markets: Record<number, unknown> = {};
  for (const m of getMarkets()) {
    const l = m.foodLedger; if (!l) continue; n++;
    const stock = l.foodStockAge0 + l.foodStockAge1 + l.foodStockAge2 + (l.foodStockAge3 ?? 0);
    const c = l.monthlyConsumption;
    const monthNeed = c ? c.urbanNeed + c.ruralNeed : 0;
    t.stock += stock; t.reserve += l.exportReserve ?? 0; t.exportable += l.exportable; t.overflow += l.storageOverflow ?? 0;
    if (c) { t.urbanNeed += c.urbanNeed; t.urbanSupplied += c.urbanSupplied; t.urbanStockGap += c.urbanStockGap; t.urbanBudgetGap += c.urbanBudgetGap; t.ruralNeed += c.ruralNeed; t.ruralSupplied += c.ruralSupplied; t.ruralFromHousehold += c.ruralFromHousehold; }
    if (stock < (l.exportReserve ?? 0)) belowReserve++;
    if (monthNeed > 0 && stock - c!.ruralFromHousehold < monthNeed) belowOneMonth++;
    markets[m.i] = { stock: Math.round(stock), reserve: Math.round(l.exportReserve ?? 0), urbanNeed: Math.round(c?.urbanNeed ?? 0), urbanSupplied: Math.round(c?.urbanSupplied ?? 0), urbanStockGap: Math.round(c?.urbanStockGap ?? 0), urbanBudgetGap: Math.round(c?.urbanBudgetGap ?? 0), stress: l.urbanFoodStressQuarters };
  }
  out.push({ month, markets: n, belowReserve, belowOneMonth, totals: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)])), byMarket: markets });
};
snap(0);
for (let m = 1; m <= months; m++) { await advanceWorld(host, { months: 1 }); snap(m); process.stderr.write(`[food] ${m}/${months}\n`); }
console.log(JSON.stringify(out));
host.dispose();
