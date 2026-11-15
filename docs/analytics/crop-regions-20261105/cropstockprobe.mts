/**
 * Market granary stock by crop each month, all markets summed, beside the crops' planted output
 * shares (docs/plan/crop-acreage-shares.md S4). Read-only; raids off, peace via env.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/crop-regions-20261105/cropstockprobe.mts <map.fmg> <out.json> [months=24]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getCropOutputMix } from "../../../src/extensions/economy/generators/agriculturalLandUse";

const [input, output, monthsArg = "24"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
{
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-caravan-raids": "off" };
}
const name = new Map(getGoods().map(g => [g.i, g.name]));
const crops = getGoods().filter(g => g.crop);

// Output shares of what the farms grow, weighted by each cell's food potential.
const world = getWorldContext();
const potential = (world.pack.cells as any).foodPotential as ArrayLike<number> | undefined;
const planted: Record<string, number> = {};
for (let c = 0; c < world.pack.cells.i.length; c++) {
  const weight = potential?.[c] ?? world.pack.cells.pop?.[c] ?? 0;
  if (!(weight > 0)) continue;
  for (const e of getCropOutputMix(world, c, crops)) planted[e.good.name] = (planted[e.good.name] ?? 0) + weight * e.share;
}

const snapshots: unknown[] = [];
for (let month = 1; month <= Number(monthsArg); month++) {
  await advanceWorld(host, { months: 1 });
  const stock: Record<string, number> = {};
  for (const m of getMarkets())
    for (const [id, inv] of Object.entries((m.foodLedger as any)?.stapleCropInventories ?? {}) as [string, any][]) {
      const units = (inv.age0 ?? 0) + (inv.age1 ?? 0) + (inv.age2 ?? 0) + (inv.age3 ?? 0);
      const key = name.get(Number(id)) ?? id;
      stock[key] = Math.round((stock[key] ?? 0) + units);
    }
  snapshots.push({ month, stock });
  process.stderr.write(`[cropstock] month ${month}\n`);
}
writeFileSync(output, JSON.stringify({ input, planted, snapshots }));
host.dispose();
