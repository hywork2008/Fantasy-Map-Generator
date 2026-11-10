import { readFileSync } from "node:fs";
import { getSaltShipments } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/industry";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const focus = 1; let rows: any[] = [];
(globalThis as any).__saltDiag = (r: any) => { if (r.market === focus) rows.push(r); };
for (let m = 1; m <= 8; m++) {
  rows = [];
  await advanceWorld(host, { months: 1 });
  const arrived = (getSaltShipments() as any[]).filter(s => s.toMarketId === focus);
  console.log(JSON.stringify({ month: m, orders: rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 100) / 100 : v]))), shipments: arrived.map(s => ({ imp: s.importerStateId, exp: s.exporterStateId, from: s.fromMarketId, bags: Math.round(s.bags), status: s.status, days: s.travelDays })) }));
}
host.dispose();
