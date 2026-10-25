/**
 * E1 §7.50 audit: splits each grazed species' supported herd into successive limits — demand target,
 * committed forage land, annual feed, winter hay, last year's feeding — summed over inhabited land cells.
 * Usage: auditCarryingCapacity.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateFaunaStockTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import {
  calculateDesiredPastureAreaHectares,
  calculateGrazingLandAllocation,
  calculatePastureCeilingAreaHectares,
  getForageAreaHectares,
  getGrazedFallowPastureEquivalentHectares,
  getLivestockHerdTargets,
  getPastureHectaresPerHead
} from "../src/extensions/economy/generators/husbandry";
import { ANNUAL_FEED_DM_KG_PER_HEAD, calculateWinterFeedShare, getPastureGrowth } from "../src/extensions/economy/generators/livestockFeedPolicy";
import { getAnnualLivestockFeedFactor, getRecentlyFedHerdShare } from "../src/extensions/economy/generators/livestockFeedState";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "36"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 0)
  throw new Error("Usage: auditCarryingCapacity.mts <archive.fmg> <output.json> [months]");
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  for (let month = 1; month <= months; month++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    console.error(`[capacity] ${month}/${months}`);
  }
  const world = getWorldContext();
  const cells = world.pack.cells;
  const rate = world.populationRate || 1;
  const stock = getOrCreateFaunaStockTable() ?? {};
  const land = { ruralPeople: 0, ceilingHa: 0, desiredPastureHa: 0, committedPastureHa: 0, fallowEquivalentHa: 0, landLimitedCells: 0, ceilingBoundCells: 0, grossNeedHa: 0, cells: 0 };
  const limits = { landShare: [] as number[], feedFactor: [] as number[], winterShare: [] as number[], fedShare: [] as number[] };
  const species: Record<string, { target: number; land: number; feed: number; winter: number; fed: number; heads: number }> = {};
  for (const cell of cells.i) {
    if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
    const targets = getLivestockHerdTargets(world, cell);
    if (!Object.keys(targets).length) continue;
    land.cells++;
    land.ruralPeople += cells.pop[cell] * rate;
    const area = getForageAreaHectares(cell);
    land.ceilingHa += calculatePastureCeilingAreaHectares(world, cell);
    const desired = calculateDesiredPastureAreaHectares(world, cell, true);
    const ceiling = calculatePastureCeilingAreaHectares(world, cell);
    land.desiredPastureHa += desired;
    if (desired >= ceiling * 0.999) land.ceilingBoundCells++;
    for (const [name, heads] of Object.entries(targets)) land.grossNeedHa += heads * getPastureHectaresPerHead(world, cell, name);
    land.fallowEquivalentHa += getGrazedFallowPastureEquivalentHectares(world, cell);
    land.committedPastureHa += Math.max(0, area - getGrazedFallowPastureEquivalentHectares(world, cell));
    const allocation = calculateGrazingLandAllocation(world, cell, area);
    const growth = getPastureGrowth(world, cell);
    const annualNeedKg = allocation.reduce((s, r) => s + r.capacityHeads * (ANNUAL_FEED_DM_KG_PER_HEAD[r.goodName] ?? 0), 0);
    const feedFactor = getAnnualLivestockFeedFactor(cell, area, allocation);
    const winterShare = calculateWinterFeedShare(annualNeedKg, area * growth.annualKgPerHa, growth.weights);
    const landShare = Math.min(feedFactor, winterShare);
    const fedShare = getRecentlyFedHerdShare(cell);
    let herdHeads = 0;
    let planned = 0;
    for (const row of allocation) {
      const herd = stock[`${cell}:${row.goodName}`];
      herdHeads += herd ? herd.young + herd.breeding + herd.old : 0;
      planned += row.capacityHeads * landShare;
    }
    const fedLimit = fedShare === null ? 1 : planned > 0 ? Math.min(1, (herdHeads * fedShare) / planned) : 1;
    const totalTarget = Object.values(targets).reduce((s, v) => s + v, 0);
    const totalLand = allocation.reduce((s, r) => s + r.capacityHeads, 0);
    if (totalLand < totalTarget * 0.999) land.landLimitedCells++;
    for (const [name, target] of Object.entries(targets)) {
      const row = (species[name] ??= { target: 0, land: 0, feed: 0, winter: 0, fed: 0, heads: 0 });
      const cap = allocation.find(r => r.goodName === name)?.capacityHeads ?? 0;
      const herd = stock[`${cell}:${name}`];
      row.target += target;
      row.land += cap;
      row.feed += cap * feedFactor;
      row.winter += cap * landShare;
      row.fed += cap * landShare * fedLimit;
      row.heads += herd ? herd.young + herd.breeding + herd.old : 0;
    }
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        notes: [
          "Each species column applies one more limit: target -> land (committed forage incl. grazed fallow) -> annual feed factor -> min(feed, winter hay) -> last year's fed share.",
          "fed equals getGrazedCarryingCapacity; desiredPastureHa is the planning demand for the target herd, capped by the ceiling."
        ],
        land,
        species: Object.fromEntries(
          Object.entries(species).map(([name, row]) => [name, { ...row, perHundredTarget: (100 * row.target) / land.ruralPeople, perHundredHeads: (100 * row.heads) / land.ruralPeople }])
        )
      },
      null,
      2
    )}\n`
  );
} finally {
  host.dispose();
}
