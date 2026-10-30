/** Field capacity factors by year (potential, land farmed, labour covered) and livestock salt limits by month. */
import { readFileSync } from "node:fs";
import { getCropLaborCoverage, getCultivableArea, getCultivatedArea, getRuralFoodCapacity, getRuralHouseholdFoodStock } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/agriculture";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { GROSS_FOOD_NEED } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/foodConstants";
import { getRuralGrainDietShare } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/ruralDiet";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const months = Number(process.argv[3] ?? 48);
let salt: any[] = [];
(globalThis as any).__saltDiag = (r: any) => salt.push(r);
const fields = () => {
  const w = getWorldContext(); const c = w.pack.cells; const rate = w.populationRate || 1;
  const cap = getRuralFoodCapacity(), cv = getCultivableArea(), cd = getCultivatedArea(), cov = getCropLaborCoverage(), st = getRuralHouseholdFoodStock();
  const t = { potential: 0, landFarmed: 0, worked: 0, eaters: 0, ruralPeople: 0, storeYears: 0, cultivable: 0, cultivated: 0 };
  for (const i of c.i) { if (c.h[i] < 20) continue; const p = cap[i] ?? 0; const land = cv[i] > 0 ? Math.min(1, (cd[i] ?? 0) / cv[i]) : 1; const lab = Math.min(1, cov[i] ?? 1);
    t.potential += p * rate; t.landFarmed += p * land * rate; t.worked += p * land * lab * rate; t.eaters += (c.pop[i] ?? 0) * getRuralGrainDietShare(c, i, cap) * rate; t.ruralPeople += (c.pop[i] ?? 0) * rate; t.storeYears += (st[i] ?? 0) / GROSS_FOOD_NEED; t.cultivable += cv[i] ?? 0; t.cultivated += cd[i] ?? 0; }
  let urban = 0; for (const b of w.pack.burgs ?? []) if (b?.i && !b.removed) urban += (b.population ?? 0) * rate * Math.max(1, w.urbanization ?? 1);
  return { ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)])), urban: Math.round(urban) };
};
const out: any[] = [{ month: 0, fields: fields() }];
for (let m = 1; m <= months; m++) {
  salt = [];
  await advanceWorld(host, { months: 1 });
  const short = salt.map(r => ({ ...r, gap: Math.max(0, r.need - Math.min(r.stockRoom, r.moneyRoom)), bind: r.stockRoom < r.moneyRoom ? "stock" : "money" })).filter(r => r.gap > 1);
  const byBind: Record<string, number> = {}; for (const r of short) byBind[r.bind] = (byBind[r.bind] ?? 0) + r.gap;
  const top = short.sort((a, b) => b.gap - a.gap).slice(0, 6).map(r => ({ st: r.stateId, mk: r.market, need: Math.round(r.need), stockRoom: Math.round(r.stockRoom), moneyRoom: Math.round(r.moneyRoom), allowance: Math.round(r.allowance), credit: Math.round(r.credit), price: +r.price.toFixed(2), gap: Math.round(r.gap) }));
  out.push({ month: m, fields: m % 3 === 0 ? fields() : undefined, livestockSalt: { byBind: Object.fromEntries(Object.entries(byBind).map(([k, v]) => [k, Math.round(v)])), top } });
  process.stderr.write(`[t] ${m}\n`);
}
console.log(JSON.stringify(out));
host.dispose();
