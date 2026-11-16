/**
 * Where farm milk is lost (docs/analytics/dairy-herd-20261116.md): after `months` months, per dairy species the
 * herd (all cohorts and breeding), people per animal, and the milk of one lactation month as the raw yield and
 * after the care, feed and lean factors of getMilkOutput, summed over cells; by biome too.
 *
 *   npx tsx docs/analytics/dairy-herd-20261116/herd.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getOrCreateFaunaStockTable } from "../../../src/extensions/economy/context/cellTables";
import { ANNUAL_LITERS_PER_LACTATING_FEMALE, LACTATING_SHARE_OF_BREEDING_COHORT } from "../../../src/extensions/economy/generators/dairyProductionPolicy";
import { getHusbandryCareFactor } from "../../../src/extensions/economy/generators/husbandry";
import { getLeanMilkFactor, getLivestockFeedCoverage } from "../../../src/extensions/economy/generators/livestockFeedState";

const [input, output, monthsArg] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
if (Number(monthsArg) > 0) await advanceWorld(host, { months: Number(monthsArg) });
const { pack, populationRate } = getWorldContext() as any;
const rate = populationRate ?? 1000;
const table = getOrCreateFaunaStockTable() ?? {};
const species = Object.keys(ANNUAL_LITERS_PER_LACTATING_FEMALE);
const out: any = { heads: 0, species: {}, biomes: {} };
for (const i of pack.cells.i) out.heads += (pack.cells.pop[i] ?? 0) * rate;
for (const b of pack.burgs ?? []) if (b?.i && !b.removed) out.heads += (b.population ?? 0) * rate;
for (const sp of species) out.species[sp] = { total: 0, breeding: 0, rawLiters: 0, careLiters: 0, feedLiters: 0, finalLiters: 0 };
for (const [key, cohorts] of Object.entries(table) as [string, any][]) {
  const [cellText, sp] = key.split(":");
  if (!species.includes(sp)) continue;
  const cell = Number(cellText);
  const total = Object.values(cohorts).reduce((s: number, v: any) => s + (typeof v === "number" ? v : 0), 0) as number;
  const raw = cohorts.breeding * LACTATING_SHARE_OF_BREEDING_COHORT * ANNUAL_LITERS_PER_LACTATING_FEMALE[sp];
  const care = getHusbandryCareFactor(cell), feed = getLivestockFeedCoverage(cell), lean = getLeanMilkFactor(cell);
  const r = out.species[sp];
  r.total += total; r.breeding += cohorts.breeding; r.rawLiters += raw; r.careLiters += raw * care; r.feedLiters += raw * care * feed; r.finalLiters += raw * care * feed * lean;
  const biome = pack.cells.biomeCode[cell];
  const bb = (out.biomes[biome] ??= { name: (globalThis as any).biomesData?.name?.[biome], cattle: 0, raw: 0, final: 0, people: 0 });
  if (sp === "Cattle") bb.cattle += total;
  bb.raw += raw; bb.final += raw * care * feed * lean;
}
for (const i of pack.cells.i) { const bb = out.biomes[pack.cells.biomeCode[i]]; if (bb) bb.people += (pack.cells.pop[i] ?? 0) * rate; }
writeFileSync(output, JSON.stringify(out, null, 1));
