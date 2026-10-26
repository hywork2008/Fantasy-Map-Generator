/**
 * E1 §7.55 audit: herd targets against grass production by biome, for inhabited land cells — target,
 * supported and actual heads, pasture need against ceiling and committed pasture, and last year's feed.
 * Usage: auditHerdByBiome.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateFaunaStockTable, getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods } from "../src/extensions/economy/context/trade";
import { getDomesticatedCarryingCapacity } from "../src/extensions/economy/generators/faunaPopulation";
import {
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

const [input, output, length = "48"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 0)
  throw new Error("Usage: auditHerdByBiome.mts <archive.fmg> <output.json> [months]");
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
    console.error(`[herd-biome] ${month}/${months}`);
  }
  const world = getWorldContext();
  const cells = world.pack.cells;
  const rate = world.populationRate || 1;
  const stock = getOrCreateFaunaStockTable() ?? {};
  const feed = getOrCreateLivestockFeedTable() ?? {};
  const goods = new Map(getGoods().map(good => [good.name, good]));
  const rows: Record<string, Record<string, number>> = {};
  for (const cell of cells.i) {
    if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
    const name = world.biomesData.name[cells.biomeCode[cell]] ?? String(cells.biomeCode[cell]);
    const row = (rows[name] ??= {
      cells: 0, ruralPeople: 0, cultivatedHa: 0, pastureKgPerHa: 0, needHa: 0, ceilingHa: 0, committedHa: 0,
      ceilingBoundCells: 0, cattleTarget: 0, cattleSupported: 0, cattleHeads: 0, sheepTarget: 0, sheepHeads: 0,
      feedRequiredKg: 0, feedFedKg: 0, cattleLand: 0, cattleFeed: 0, cattleWinter: 0, cattleFed: 0
    });
    const people = cells.pop[cell] * rate;
    const targets = getLivestockHerdTargets(world, cell);
    const fallow = getGrazedFallowPastureEquivalentHectares(world, cell);
    let gross = 0;
    for (const [species, heads] of Object.entries(targets)) gross += heads * getPastureHectaresPerHead(world, cell, species);
    const need = Math.max(0, gross - fallow);
    const ceiling = calculatePastureCeilingAreaHectares(world, cell);
    const herd = (species: string) => {
      const h = stock[`${cell}:${species}`];
      return h ? h.young + h.breeding + h.old : 0;
    };
    row.cells++;
    row.ruralPeople += people;
    row.cultivatedHa += world.pack.landUse?.cells[cell]?.allocatedAreaHa ?? 0;
    row.pastureKgPerHa += getPastureGrowth(world, cell).annualKgPerHa * people;
    row.needHa += need;
    row.ceilingHa += Math.min(ceiling, need);
    row.committedHa += Math.max(0, getForageAreaHectares(cell) - fallow);
    row.ceilingBoundCells += Number(need > ceiling);
    row.cattleTarget += targets.Cattle ?? 0;
    row.cattleSupported += goods.has("Cattle") ? getDomesticatedCarryingCapacity(cell, goods.get("Cattle")!, 0) : 0;
    row.cattleHeads += herd("Cattle");
    row.sheepTarget += targets.Sheep ?? 0;
    row.sheepHeads += herd("Sheep");
    // Successive limits as in auditCarryingCapacity.mts: land -> annual feed -> winter hay -> last year's feeding.
    const area = getForageAreaHectares(cell);
    const allocation = calculateGrazingLandAllocation(world, cell, area);
    const growth = getPastureGrowth(world, cell);
    const annualNeedKg = allocation.reduce((s, r) => s + r.capacityHeads * (ANNUAL_FEED_DM_KG_PER_HEAD[r.goodName] ?? 0), 0);
    const feedFactor = getAnnualLivestockFeedFactor(cell, area, allocation);
    const landShare = Math.min(feedFactor, calculateWinterFeedShare(annualNeedKg, area * growth.annualKgPerHa, growth.weights));
    const fedShare = getRecentlyFedHerdShare(cell);
    const herdHeads = allocation.reduce((s, r) => s + herd(r.goodName), 0);
    const planned = allocation.reduce((s, r) => s + r.capacityHeads * landShare, 0);
    const fedLimit = fedShare === null ? 1 : planned > 0 ? Math.min(1, (herdHeads * fedShare) / planned) : 1;
    const cattleLand = allocation.find(r => r.goodName === "Cattle")?.capacityHeads ?? 0;
    row.cattleLand += cattleLand;
    row.cattleFeed += cattleLand * feedFactor;
    row.cattleWinter += cattleLand * landShare;
    row.cattleFed += cattleLand * landShare * fedLimit;
    for (const sample of feed[cell]?.samples ?? []) {
      row.feedRequiredKg += sample.requiredKg;
      row.feedFedKg += sample.fedKg;
    }
  }
  const out = Object.fromEntries(
    Object.entries(rows)
      .sort((a, b) => b[1].ruralPeople - a[1].ruralPeople)
      .map(([name, r]) => {
        const per100 = (v: number) => (100 * v) / r.ruralPeople;
        return [name, {
          ...r,
          pastureKgPerHa: r.pastureKgPerHa / r.ruralPeople,
          needHaPerPerson: r.needHa / r.ruralPeople,
          cultivatedHaPerPerson: r.cultivatedHa / r.ruralPeople,
          cattleTargetPer100: per100(r.cattleTarget),
          cattleSupportedPer100: per100(r.cattleSupported),
          cattleLimitsPer100: [r.cattleLand, r.cattleFeed, r.cattleWinter, r.cattleFed].map(per100),
          cattleHeadsPer100: per100(r.cattleHeads),
          sheepTargetPer100: per100(r.sheepTarget),
          sheepHeadsPer100: per100(r.sheepHeads),
          feedUnmetShare: r.feedRequiredKg > 0 ? 1 - r.feedFedKg / r.feedRequiredKg : 0
        }];
      })
  );
  writeFileSync(
    output,
    `${JSON.stringify({
      inputSha256: createHash("sha256").update(bytes).digest("hex"),
      months,
      notes: ["needHa is target pasture after grazed fallow; ceilingHa is that need capped by the cell ceiling; feed is the trailing 12-month ledger."],
      rows: out
    }, null, 2)}\n`
  );
} finally {
  host.dispose();
}
