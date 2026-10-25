/**
 * E1 §7.50 audit: pasture need against the pasture ceiling, by biome, for inhabited land cells.
 * Usage: auditPastureByBiome.mts <archive.fmg> <output.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import {
  calculatePastureCeilingAreaHectares,
  getForageAreaHectares,
  getGrazedFallowPastureEquivalentHectares,
  getLivestockHerdTargets,
  getPastureHectaresPerHead
} from "../src/extensions/economy/generators/husbandry";
import { getPastureGrowth } from "../src/extensions/economy/generators/livestockFeedPolicy";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "0"] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: auditPastureByBiome.mts <archive.fmg> <output.json>");
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(readFileSync(input)));
  await host.prepare();
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  for (let month = 1; month <= Number(length); month++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
  }
  const world = getWorldContext();
  const cells = world.pack.cells;
  const rate = world.populationRate || 1;
  const rows: Record<string, Record<string, number>> = {};
  for (const cell of cells.i) {
    if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
    const name = world.biomesData.name[cells.biomeCode[cell]] ?? String(cells.biomeCode[cell]);
    const row = (rows[name] ??= { cells: 0, ruralPeople: 0, cultivatedHa: 0, needHa: 0, ceilingHa: 0, forageHa: 0, pastureKgPerHa: 0 });
    const targets = getLivestockHerdTargets(world, cell);
    const fallow = getGrazedFallowPastureEquivalentHectares(world, cell);
    let need = 0;
    for (const [species, heads] of Object.entries(targets)) need += heads * getPastureHectaresPerHead(world, cell, species);
    row.cells++;
    row.ruralPeople += cells.pop[cell] * rate;
    row.cultivatedHa += world.pack.landUse?.cells[cell]?.allocatedAreaHa ?? 0;
    row.needHa += Math.max(0, need - fallow);
    row.ceilingHa += Math.min(calculatePastureCeilingAreaHectares(world, cell), Math.max(0, need - fallow));
    row.forageHa += Math.max(0, getForageAreaHectares(cell) - fallow);
    row.pastureKgPerHa += getPastureGrowth(world, cell).annualKgPerHa * cells.pop[cell] * rate;
  }
  for (const row of Object.values(rows)) row.pastureKgPerHa /= row.ruralPeople;
  writeFileSync(output, `${JSON.stringify({ notes: ["ceilingHa is the need capped by each cell's pasture ceiling; forageHa is committed pasture excluding fallow."], rows }, null, 2)}\n`);
} finally {
  host.dispose();
}
