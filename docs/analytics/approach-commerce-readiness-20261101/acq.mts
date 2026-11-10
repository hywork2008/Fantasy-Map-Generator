/**
 * Re-measures docs/plan/approach-commerce-quarters.md §4.2 (gates) and §4.5 (trade stages) on the
 * current code: yearly trade stages and deal durations, and the gate metrics at each year end.
 * Usage: acq.mts <archive.fmg> <out.json> [years]
 */
import { readFileSync, writeFileSync } from "node:fs";
const R = "/Users/h-yamaguchi/Projects/fmg-2";
const { createObserveViews } = await import(`${R}/scripts/lib/observeViews.mts`);
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const [input, output, length = "3"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
const views = createObserveViews(() => host.world, () => ({ year: host.simulation.currentYear, month: host.simulation.currentMonth, day: host.simulation.currentDay, tick: host.simulation.tickCount }));
views.trade();
const median = (v: number[]) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const years: unknown[] = [];
for (let y = 1; y <= Number(length); y++) {
  for (let m = 0; m < 12; m++) await advanceWorld(host, { months: 1 });
  const t: any = views.trade();
  const g: any[] = views.gates();
  const withTraffic = g.filter(b => b.totalSlots > 0);
  const top = withTraffic.map(b => b.gates[0]?.share ?? 0);
  const allGates = withTraffic.flatMap(b => b.gates);
  const multi = withTraffic.filter(b => b.gates.filter((x: any) => x.share > 0.01).length >= 2).length;
  const valueTotals: Record<string, number> = {}; const slotTotals: Record<string, number> = {};
  for (const x of allGates) {
    for (const [k, v] of Object.entries(x.cargoValue ?? {})) valueTotals[k] = (valueTotals[k] ?? 0) + (v as number);
    for (const [k, v] of Object.entries(x.cargoClasses ?? {})) slotTotals[k] = (slotTotals[k] ?? 0) + (v as number);
  }
  const norm = (o: Record<string, number>) => { const s = Object.values(o).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round((v / (s || 1)) * 1000) / 1000])); };
  // Luxury value concentrated in one gate, per town with luxury value.
  const lux = withTraffic.map(b => b.gates.map((x: any) => x.cargoValue?.luxury ?? 0)).filter(v => v.some((x: number) => x > 0)).map(v => Math.max(...v) / v.reduce((a: number, c: number) => a + c, 0));
  years.push({
    year: y,
    gates: {
      towns: withTraffic.length, townsTwoGates: multi, topShareMedian: median(top),
      throughShareMedian: median(allGates.map(x => x.throughShare)),
      inboundMain: allGates.filter(x => x.inboundShare > 0.5).length, outboundMain: allGates.filter(x => x.inboundShare < 0.5 && x.inbound + x.outbound > 0).length, gates: allGates.length,
      slotClasses: norm(slotTotals), valueClasses: norm(valueTotals), luxuryTowns: lux.length, luxuryOneGateMedian: median(lux)
    },
    stages: t.stages,
    settlement: t.settlement
  });
  console.log("year", y);
}
writeFileSync(output, JSON.stringify({ input, years }, null, 1));
host.dispose();
