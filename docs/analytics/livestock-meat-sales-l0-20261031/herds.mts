import { readFileSync } from "node:fs";
import { getOrCreateFaunaStockTable } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/cellTables";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
const t: any = getOrCreateFaunaStockTable(); const sum: Record<string, number> = {};
for (const [k, h] of Object.entries(t ?? {}) as any) { const n = k.split(":")[1]; sum[n] = (sum[n] ?? 0) + (h.young ?? 0) + (h.breeding ?? 0) + (h.old ?? 0); }
const w = getWorldContext(); const rate = w.populationRate || 1; let rural = 0, urban = 0;
for (const i of w.pack.cells.i) if (w.pack.cells.h[i] >= 20) rural += w.pack.cells.pop[i] * rate;
for (const b of w.pack.burgs) if (b?.i && !b.removed) urban += (b.population ?? 0) * rate * Math.max(1, w.urbanization ?? 1);
console.log(JSON.stringify({ herds: Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round(v)])), rural: Math.round(rural), urban: Math.round(urban) }));
host.dispose();
