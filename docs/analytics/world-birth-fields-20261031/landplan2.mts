/** Do the planned fields, at the economy's yield, feed the people the plan sized them for? */
import { readFileSync } from "node:fs";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { getRuralFoodCapacity } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/agriculture";
import { getRuralGrainDietShare } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/ruralDiet";
import { createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
const w = getWorldContext(); const lu = w.pack.landUse!; const rate = w.populationRate || 1; const cap = getRuralFoodCapacity(); const c = w.pack.cells;
const t = { capacity: 0, capacityAtRequired: 0, ruralEaters: 0, urban: 0, transportHa: 0, allocatedHa: 0, requiredHa: 0, fedByPlanRural: 0 };
let cellsWithFields = 0, cellsDemandNoFields = 0, demandNoFieldsPeople = 0;
for (const [id, b] of Object.entries(lu.cells) as any) {
  const i = +id; const k = (cap[i] ?? 0) * rate; t.capacity += k;
  const perHa = b.allocatedAreaHa > 0 ? k / b.allocatedAreaHa : 0;
  t.capacityAtRequired += perHa * b.requiredAreaHa; t.allocatedHa += b.allocatedAreaHa; t.requiredHa += b.requiredAreaHa;
  t.transportHa += (b.transportAllocations ?? []).reduce((s: number, a: any) => s + a.areaHa, 0);
  if (b.allocatedAreaHa > 0) cellsWithFields++; else if (b.requiredAreaHa > 0) { cellsDemandNoFields++; demandNoFieldsPeople += b.foodDemandPeople; }
}
for (const i of c.i) if (c.h[i] >= 20) t.ruralEaters += (c.pop[i] ?? 0) * getRuralGrainDietShare(c, i, cap) * rate;
for (const b of w.pack.burgs) if (b?.i && !b.removed) t.urban += (b.population ?? 0) * rate * Math.max(1, w.urbanization ?? 1);
console.log(JSON.stringify({ ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)])), cellsWithFields, cellsDemandNoFields, demandNoFieldsPeople: Math.round(demandNoFieldsPeople) }));
host.dispose();
