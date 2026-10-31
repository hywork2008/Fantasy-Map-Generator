/** Saltworks annual capacity by state at load, against the V2 demand. Usage: capacity.mts <archive.fmg> */
import { readFileSync } from "node:fs";
import { getSaltworks } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/industry";
import { createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
const byState: Record<number, number> = {};
let total = 0;
for (const w of getSaltworks() as any[]) { byState[w.stateId] = (byState[w.stateId] ?? 0) + (w.annualCapacityBags ?? 0); total += w.annualCapacityBags ?? 0; }
console.log(JSON.stringify({ total: Math.round(total), count: getSaltworks().length, byState: Object.fromEntries(Object.entries(byState).map(([k, v]) => [k, Math.round(v)])) }));
host.dispose();
