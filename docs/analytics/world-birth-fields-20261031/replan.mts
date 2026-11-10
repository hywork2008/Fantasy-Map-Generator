/** Capacity vs grain eaters: as saved, after the world-birth replan (annual, capped), and after an uncapped first plan. */
import { readFileSync } from "node:fs";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { getRuralFoodCapacity } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/agriculture";
import { getRuralGrainDietShare } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/ruralDiet";
import { DevelopmentPotential } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/developmentPotential";
import { createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
const measure = (label: string) => {
  const w = getWorldContext(); const rate = w.populationRate || 1; const cap = getRuralFoodCapacity(); const c = w.pack.cells;
  let capacity = 0, eaters = 0, urban = 0, allocated = 0, required = 0;
  for (const i of c.i) { if (c.h[i] < 20) continue; capacity += (cap[i] ?? 0) * rate; eaters += (c.pop[i] ?? 0) * getRuralGrainDietShare(c, i, cap) * rate; }
  for (const b of w.pack.burgs) if (b?.i && !b.removed) urban += (b.population ?? 0) * rate * Math.max(1, w.urbanization ?? 1);
  for (const b of Object.values(w.pack.landUse?.cells ?? {}) as any) { allocated += b.allocatedAreaHa; required += b.requiredAreaHa; }
  console.log(JSON.stringify({ label, capacity: Math.round(capacity), eaters: Math.round(eaters), urban: Math.round(urban), ratio: +(capacity / (eaters + urban)).toFixed(3), allocatedHa: Math.round(allocated), requiredHa: Math.round(required) }));
};
measure("saved");
DevelopmentPotential.replanWorldBirth();
measure("replan-annual");
const w = getWorldContext();
delete (w.pack as any).landUse;
DevelopmentPotential.replanWorldBirth();
measure("replan-first-plan");
DevelopmentPotential.replanWorldBirth();
measure("replan-first-plan-again");
host.dispose();
