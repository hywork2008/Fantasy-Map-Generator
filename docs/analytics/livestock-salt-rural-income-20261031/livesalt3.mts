/** Per market and year: rural income, mean purse, the full livestock salt bill, and what the 5% allowance allowed. */
import { readFileSync } from "node:fs";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { setRuralHouseholdWealthFlowObserver } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/householdWealth";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const months = Number(process.argv[3] ?? 24);
type Acc = { income: number; spend: number; purseSum: number; bill: number; allowance: number; short: number; incomeByMonth: number[] };
const acc = new Map<string, Acc>();
let year = 0;
const get = (m: number) => { const k = `${year}:${m}`; let a = acc.get(k); if (!a) acc.set(k, (a = { income: 0, spend: 0, purseSum: 0, bill: 0, allowance: 0, short: 0, incomeByMonth: Array(12).fill(0) })); return a; };
let month = 0;
setRuralHouseholdWealthFlowObserver((marketId, amount) => { const a = get(marketId); if (amount > 0) { a.income += amount; a.incomeByMonth[month % 12] += amount; } else a.spend -= amount; });
for (month = 0; month < months; month++) {
  year = Math.floor(month / 12);
  (globalThis as any).__saltDiag = [];
  await advanceWorld(host, { months: 1 });
  const seen = new Set<number>();
  for (const r of (globalThis as any).__saltDiag) {
    const a = get(r.m);
    a.bill += r.need * r.price;
    if (!seen.has(r.m)) { a.allowance += r.allowance; seen.add(r.m); }
    a.short += Math.max(0, r.need - Math.min(r.need, r.stockRoom, r.money));
  }
  for (const mk of getMarkets()) get(mk.i).purseSum += mk.foodLedger?.ruralHouseholdWealth ?? 0;
}
const out = [...acc.entries()].map(([k, a]) => { const [y, m] = k.split(":").map(Number); return { y, m, income: Math.round(a.income), spend: Math.round(a.spend), meanPurse: Math.round(a.purseSum / 12), saltBill: Math.round(a.bill), allowance: Math.round(a.allowance), shortBags: Math.round(a.short), billShareOfIncome: a.income ? +(a.bill / a.income).toFixed(3) : null, incomeByMonth: a.incomeByMonth.map(Math.round) }; }).filter(r => r.saltBill > 0).sort((p, q) => p.y - q.y || q.shortBags - p.shortBags);
for (const r of out) console.log(JSON.stringify(r));
host.dispose();
