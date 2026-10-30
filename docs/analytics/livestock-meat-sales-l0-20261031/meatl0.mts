/** L0 (docs/plan/livestock-meat-sales.md §4): per market, a year's herd offtake meat, urban meat demand and bill, herdDiet meat, urban purses. */
import { readFileSync } from "node:fs";
import { getMarkets, getGoods } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { getOrCreateFaunaStockTable } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/cellTables";
import { getHouseholdWealth } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/burgMarketLedgers";
import { setGoodFlowObserver } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/goodsBalanceLedger";
import { HERD_MEAT_OFFTAKE, getHerdFoodKcal } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/herdDiet";
import { DAILY_CALORIC_NEED_KCAL } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/nutritionAudit";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const EDIBLE_KG: Record<string, number> = { Cattle: 242 * 0.45359237, Sheep: 23.5 * 0.45359237, Pig: (42280 / 656) * 0.7 * 0.45359237, Goats: 9 };
const URBAN_KG = 25, MEAT_VALUE_PER_KG = (2.5 / (200 / 0.43)), FARMGATE = 0.8;
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const months = Number(process.argv[3] ?? 12);
type Row = { offtakeKg: number; offtakeByMonth: number[]; slaughterKg: number; craftHeads: Record<string, number>; urbanPeople: number; purseSum: number };
const rows = new Map<number, Row>();
const row = (m: number) => { let r = rows.get(m); if (!r) rows.set(m, (r = { offtakeKg: 0, offtakeByMonth: Array(12).fill(0), slaughterKg: 0, craftHeads: {}, urbanPeople: 0, purseSum: 0 })); return r; };
let month = 0;
setGoodFlowObserver(f => {
  if (f.marketId === undefined) return;
  const goods = getGoods(); const g = goods.find(x => x.i === f.goodId); if (!g || !(g.name in EDIBLE_KG)) return;
  const r = row(f.marketId);
  if (f.direction === "source" && f.category === "ruralHarvest") { r.offtakeKg += f.units * EDIBLE_KG[g.name]; r.offtakeByMonth[month] += f.units * EDIBLE_KG[g.name]; }
  if (f.direction === "sink" && f.category === "recipeInput") {
    const rel = goods.find(x => x.i === f.relatedGoodId)?.name ?? "?";
    if (rel === "Tallow" || rel === "Leather") r.slaughterKg += f.units * EDIBLE_KG[g.name];
    const k = `${g.name}->${rel}`; r.craftHeads[k] = (r.craftHeads[k] ?? 0) + f.units;
  }
});
const w = getWorldContext(); const rate = Math.max(1, w.populationRate ?? 1);
for (month = 0; month < months; month++) {
  await advanceWorld(host, { months: 1 });
  for (const b of w.pack.burgs) if (b?.i && !b.removed && b.market) row(b.market).purseSum += getHouseholdWealth(b.i);
}
for (const b of w.pack.burgs) if (b?.i && !b.removed && b.market) row(b.market).urbanPeople += (b.population ?? 0) * rate * Math.max(1, w.urbanization ?? 1);
// Meat the wet-land diet counts (herdDiet.ts): the eaten herd share times the meat part of the herds' food.
const stock = getOrCreateFaunaStockTable() ?? {}; const c = w.pack.cells; const column = (await import("/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade")) as any;
const marketOf = (globalThis as any).__noop;
const cellMarket: ArrayLike<number> = (await import("/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/economyContext")).getMarketCellColumn();
const herdDietKg = new Map<number, number>();
for (const i of c.i) {
  const share = (c as any).herdDietShare?.[i] ?? 0; if (!(share > 0) || c.h[i] < 20) continue;
  const herds = Object.fromEntries(Object.keys(HERD_MEAT_OFFTAKE).map(s => [s, (stock as any)[`${i}:${s}`]]));
  const total = getHerdFoodKcal(herds); if (!(total > 0)) continue;
  let meatKg = 0; for (const [s, m] of Object.entries(HERD_MEAT_OFFTAKE)) { const h = herds[s]; if (h) meatKg += Math.max(0, h.young + h.breeding + h.old) * m.share * m.edibleKg; }
  const eatenKcal = share * c.pop[i] * rate * DAILY_CALORIC_NEED_KCAL * 365.2425;
  herdDietKg.set(cellMarket[i], (herdDietKg.get(cellMarket[i]) ?? 0) + meatKg * Math.min(1, eatenKcal / total));
}
const out: any[] = [];
const t = { offtakeT: 0, slaughterT: 0, urbanDemandT: 0, herdDietT: 0, bill: 0, purse: 0 };
for (const mk of getMarkets()) {
  const r = row(mk.i); const demandKg = r.urbanPeople * URBAN_KG * (months / 12); const bill = demandKg * MEAT_VALUE_PER_KG; const purse = r.purseSum / months;
  const o = { market: mk.i, urbanPeople: Math.round(r.urbanPeople), offtakeT: Math.round(r.offtakeKg / 1000), slaughterT: Math.round(r.slaughterKg / 1000), urbanDemandT: Math.round(demandKg / 1000), herdDietT: Math.round((herdDietKg.get(mk.i) ?? 0) / 1000), urbanBill: Math.round(bill), ruralPay: Math.round(bill * FARMGATE), meanUrbanPurse: Math.round(purse), billPerPurse: purse > 0 ? +(bill / purse).toFixed(2) : null, demandPerSlaughter: r.slaughterKg > 0 ? +(demandKg / r.slaughterKg).toFixed(2) : null, offtakeByMonthT: r.offtakeByMonth.map(v => Math.round(v / 1000)), craftHeads: Object.fromEntries(Object.entries(r.craftHeads).map(([k, v]) => [k, Math.round(v)])) };
  out.push(o); t.offtakeT += o.offtakeT; t.slaughterT += o.slaughterT; t.urbanDemandT += o.urbanDemandT; t.herdDietT += o.herdDietT; t.bill += o.urbanBill; t.purse += o.meanUrbanPurse;
}
for (const o of out.sort((a, b) => b.urbanBill - a.urbanBill)) console.log(JSON.stringify(o));
console.log(JSON.stringify({ world: t }));
host.dispose();
