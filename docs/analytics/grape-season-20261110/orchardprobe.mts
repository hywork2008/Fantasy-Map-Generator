/**
 * Grape season and wine country (docs/analytics/grape-season-20261110.md), from orchard-area-20261110/orchardprobe.mts. Read-only: each month it sums
 * by perennial crop the desired area, the staffed area, the harvest and the population of the cells
 * that chose it, and by market the food-processing ledger of the fruits and their drinks.
 *
 *   npx tsx docs/analytics/grape-season-20261110/orchardprobe.mts <map.fmg> <out.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getMarkets } from "../../../src/extensions/economy/context/trade";
import { getWorldContext } from "../../../src/extensions/economy/economyContext";
import {
  getPerennialCropMix,
  getPerennialHarvestOutputs,
  getViticultureWorkerFactor
} from "../../../src/extensions/economy/generators/viticulture";

const LEDGER = ["Grapes", "Raisins", "Wine", "Apples", "Pears", "Cider", "Perry", "Beer", "Mead", "Honey"];
const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const last: Record<string, Record<string, number>> = {};
const snapshots = [];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const world = getWorldContext();
  const cells = world.pack.cells;
  const rate = Math.max(1, world.populationRate || 1);
  let population = 0;
  const crops: Record<string, { cells: number; desiredHa: number; staffedHa: number; harvest: number; pop: number }> = {};
  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    const pop = Math.max(0, cells.pop[cellId] ?? 0) * rate;
    population += pop;
    const mix = getPerennialCropMix(world, cellId);
    if (!mix.length) continue;
    const factor = getViticultureWorkerFactor(cellId);
    const harvest = getPerennialHarvestOutputs(cellId);
    for (const entry of mix) {
      const row = (crops[entry.good.name] ??= { cells: 0, desiredHa: 0, staffedHa: 0, harvest: 0, pop: 0 });
      row.cells++;
      row.desiredHa += entry.areaHectares;
      row.staffedHa += entry.areaHectares * factor;
      row.harvest += harvest.find(h => h.goodId === entry.good.i)?.amount ?? 0;
      row.pop += pop;
    }
  }
  const ledger: Record<string, Record<string, number>> = {};
  for (const name of LEDGER) {
    const sum: Record<string, number> = {};
    for (const market of getMarkets()) {
      const row = (market.foodProcessingLedger as Record<string, Record<string, number>> | undefined)?.[name];
      if (!row) continue;
      for (const [key, value] of Object.entries(row)) if (typeof value === "number") sum[key] = (sum[key] ?? 0) + value;
    }
    const previous = last[name] ?? {};
    last[name] = sum;
    ledger[name] = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v - (previous[k] ?? 0)]));
  }
  snapshots.push({ month, population, crops, ledger });
  writeFileSync(output, JSON.stringify({ input, snapshots }));
  console.log(`[orchardprobe] ${input} month ${month}`);
}
process.exit(0);
