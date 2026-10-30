/** Per state: salt need, capacity, output, idle capacity, and where its orders were made. */
import { readFileSync } from "node:fs";
import { getSaltworks, getStateSaltLedgers, getSaltShipments } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/industry";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const out: unknown[] = [];
for (let m = 1; m <= Number(process.argv[3] ?? 12); m++) {
  await advanceWorld(host, { months: 1 });
  const rows: Record<number, any> = {};
  for (const l of getStateSaltLedgers() as any[]) rows[l.stateId] = { need: Math.round((l.monthlyHouseholdDemandBags ?? 0) + (l.monthlyLivestockDemandBags ?? 0)), unmet: Math.round((l.monthlyUnmetHouseholdBags ?? 0) + (l.monthlyUnmetLivestockBags ?? 0)), cap: 0, out: 0, works: 0, methods: {} };
  for (const w of getSaltworks()) { if (!w.active) continue; const r = (rows[w.stateId] ??= { need: 0, unmet: 0, cap: 0, out: 0, works: 0, methods: {} }); r.cap += w.monthlyCapacityBags ?? 0; r.out += w.monthlyOutputBags ?? 0; r.works++; r.methods[w.productionMethod ?? "?"] = (r.methods[w.productionMethod ?? "?"] ?? 0) + 1; }
  // Bags shipped this month from producer state to importer state.
  const flows: Record<string, number> = {};
  for (const s of getSaltShipments() as any[]) if (s.exporterStateId !== s.importerStateId) flows[`${s.exporterStateId}->${s.importerStateId}`] = Math.round((flows[`${s.exporterStateId}->${s.importerStateId}`] ?? 0) + s.bags);
  for (const r of Object.values(rows)) { r.cap = Math.round(r.cap); r.out = Math.round(r.out); }
  out.push({ month: m, states: rows, flows });
  process.stderr.write(`[state] ${m}\n`);
}
console.log(JSON.stringify(out));
host.dispose();
