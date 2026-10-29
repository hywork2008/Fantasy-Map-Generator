/**
 * E1 §7.61 audit: decompose the grazed carrying capacity of a species into its factors —
 * planned heads on the forage area, annual feed factor, winter feed share and last year's fed limit —
 * monthly over a window, and attribute the change between window ends to cells and factors.
 * Usage: auditCapacityDip.mts <archive.fmg> <output.json> <fromMonth> <toMonth> [species=Cattle]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateFaunaStockTable, getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods } from "../src/extensions/economy/context/trade";
import { calculateGrazingLandAllocation, getForageAreaHectares } from "../src/extensions/economy/generators/husbandry";
import {
  ANNUAL_FEED_DM_KG_PER_HEAD,
  calculateWinterFeedShare,
  getPastureGrowth
} from "../src/extensions/economy/generators/livestockFeedPolicy";
import {
  getAnnualLivestockFeedFactor,
  getRecentlyFedHerdShare,
  livestockFeedPeriod
} from "../src/extensions/economy/generators/livestockFeedState";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, fromText, toText, speciesName = "Cattle"] = process.argv.slice(2);
const from = Number(fromText);
const to = Number(toText);
if (!input || !output || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from)
  throw new Error("Usage: auditCapacityDip.mts <archive.fmg> <output.json> <fromMonth> <toMonth> [species]");
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const startedAt = Date.now();
const progress = (message: string) =>
  console.error(`[capacity-dip] ${new Date().toISOString()} +${Math.round((Date.now() - startedAt) / 1000)}s ${message}`);

interface CellFactors {
  biome: string;
  areaHa: number;
  planned: number;
  feedFactor: number;
  winterShare: number;
  fedShare: number | null;
  fedLimit: number;
  capacity: number;
  herdHeads: number;
  herdOwnHeads: number;
  external: { purchasedKg: number; residueKg: number; soldKg: number; harvestLossKg: number; storageLossKg: number };
  requiredKg: number;
  fedKg: number;
}

function cellFactors(cellId: number, good: { name: string }): CellFactors | null {
  const world = getWorldContext();
  const area = getForageAreaHectares(cellId);
  const targets = calculateGrazingLandAllocation(world, cellId, area);
  const planned = targets.find(row => row.goodName === good.name)?.capacityHeads ?? 0;
  if (!(planned > 0)) return null;
  const annualNeedKg = targets.reduce(
    (sum, row) => sum + row.capacityHeads * (ANNUAL_FEED_DM_KG_PER_HEAD[row.goodName] ?? 0),
    0
  );
  const growth = getPastureGrowth(world, cellId);
  const winterShare = calculateWinterFeedShare(annualNeedKg, area * growth.annualKgPerHa, growth.weights);
  const feedFactor = getAnnualLivestockFeedFactor(cellId, area, targets);
  const landShare = Math.min(feedFactor, winterShare);
  const fedShare = getRecentlyFedHerdShare(cellId);
  const stock = getOrCreateFaunaStockTable();
  const headsOf = (name: string) => {
    const herd = stock?.[`${cellId}:${name}`];
    return herd ? Math.max(0, herd.young) + Math.max(0, herd.breeding) + Math.max(0, herd.old) : 0;
  };
  const herdHeads = targets.reduce((sum, row) => sum + headsOf(row.goodName), 0);
  const plannedHeads = targets.reduce((sum, row) => sum + row.capacityHeads * landShare, 0);
  const fedLimit =
    fedShare === null
      ? 1
      : plannedHeads > 0
        ? Math.max(fedShare, Math.min(1, (herdHeads * fedShare) / plannedHeads))
        : 1;
  const period = livestockFeedPeriod();
  const samples = (getOrCreateLivestockFeedTable()?.[cellId]?.samples ?? []).filter(
    sample => sample.period <= period && sample.period > period - 12
  );
  const external = { purchasedKg: 0, residueKg: 0, soldKg: 0, harvestLossKg: 0, storageLossKg: 0 };
  let requiredKg = 0;
  let fedKg = 0;
  for (const sample of samples) {
    external.purchasedKg += sample.purchasedKg;
    external.residueKg += sample.cropResidueFeedKg ?? 0;
    external.soldKg += sample.soldKg;
    external.harvestLossKg += sample.harvestLossKg;
    external.storageLossKg += sample.storageLossKg ?? 0;
    requiredKg += sample.requiredKg;
    fedKg += sample.fedKg;
  }
  const code = world.pack.cells.biomeCode[cellId];
  return {
    biome: world.biomesData.name[code] ?? String(code),
    areaHa: area,
    planned,
    feedFactor,
    winterShare,
    fedShare,
    fedLimit,
    capacity: planned * landShare * fedLimit,
    herdHeads,
    herdOwnHeads: headsOf(good.name),
    external,
    requiredKg,
    fedKg
  };
}

function survey(good: { name: string }) {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const rows = new Map<number, CellFactors>();
  for (const cell of cells.i) {
    if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
    const row = cellFactors(cell, good);
    if (row) rows.set(cell, row);
  }
  return rows;
}

function totals(rows: Map<number, CellFactors>) {
  const sum = {
    cells: rows.size,
    plannedHeads: 0,
    afterLandShare: 0,
    capacity: 0,
    heads: 0,
    feedFactorBinding: 0,
    winterShareBinding: 0,
    fedLimitedCells: 0,
    lostToLandShare: 0,
    lostToFedLimit: 0
  };
  for (const row of rows.values()) {
    const land = row.planned * Math.min(row.feedFactor, row.winterShare);
    sum.plannedHeads += row.planned;
    sum.afterLandShare += land;
    sum.capacity += row.capacity;
    sum.heads += row.herdOwnHeads;
    if (row.feedFactor < Math.min(1, row.winterShare)) sum.feedFactorBinding++;
    else if (row.winterShare < 1) sum.winterShareBinding++;
    if (row.fedLimit < 1) sum.fedLimitedCells++;
    sum.lostToLandShare += row.planned - land;
    sum.lostToFedLimit += land - row.capacity;
  }
  return sum;
}

try {
  progress(`loading ${input}`);
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  const good = getGoods().find(row => row.name === speciesName);
  if (!good) throw new Error(`Unknown species ${speciesName}`);
  const monthly: ReturnType<typeof totals>[] = [];
  let first: Map<number, CellFactors> | undefined;
  let last: Map<number, CellFactors> | undefined;
  for (let month = 0; month <= to; month++) {
    if (month > 0) {
      await advanceWorld(host, { months: 1 });
      await new Promise(done => setImmediate(done));
    }
    const date = [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay];
    let note = "";
    if (month >= from) {
      const rows = survey(good);
      const row = { month, date, ...totals(rows) };
      monthly.push(row);
      if (month === from) first = rows;
      last = rows;
      note = ` capacity=${Math.round(row.capacity)} heads=${Math.round(row.heads)} fedLimited=${row.fedLimitedCells}`;
    }
    const heapMb = Math.round(process.memoryUsage().heapUsed / 2 ** 20);
    progress(`month ${month}/${to} (${date.join("-")}) heap=${heapMb}MB${note}`);
  }
  // Attribute the change between window ends: per cell, sequentially swap planned, land share, fed limit.
  const attribution = { planned: 0, landShare: 0, fedLimit: 0, cellsEntered: 0, cellsLeft: 0 };
  const byBiome: Record<string, { cells: number; before: number; after: number; planned: number; landShare: number; fedLimit: number }> = {};
  const deltas: { cell: number; biome: string; before: CellFactors; after: CellFactors; delta: number }[] = [];
  const allCells = new Set([...(first?.keys() ?? []), ...(last?.keys() ?? [])]);
  for (const cell of allCells) {
    const a = first?.get(cell);
    const b = last?.get(cell);
    const biome = (b ?? a)!.biome;
    const bucket = (byBiome[biome] ??= { cells: 0, before: 0, after: 0, planned: 0, landShare: 0, fedLimit: 0 });
    bucket.cells++;
    bucket.before += a?.capacity ?? 0;
    bucket.after += b?.capacity ?? 0;
    if (!a || !b) {
      if (!a) attribution.cellsEntered += b!.capacity;
      else attribution.cellsLeft -= a.capacity;
      continue;
    }
    const landA = Math.min(a.feedFactor, a.winterShare);
    const landB = Math.min(b.feedFactor, b.winterShare);
    const p = (b.planned - a.planned) * landA * a.fedLimit;
    const l = b.planned * (landB - landA) * a.fedLimit;
    const f = b.planned * landB * (b.fedLimit - a.fedLimit);
    attribution.planned += p;
    attribution.landShare += l;
    attribution.fedLimit += f;
    bucket.planned += p;
    bucket.landShare += l;
    bucket.fedLimit += f;
    deltas.push({ cell, biome, before: a, after: b, delta: b.capacity - a.capacity });
  }
  deltas.sort((x, y) => x.delta - y.delta);
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: hash(bytes),
        species: speciesName,
        window: [from, to],
        worldSettings: sim.worldSettings,
        notes: [
          "Month 0 is the loaded archive date; capacity mirrors husbandry.getGrazedCarryingCapacity: planned x min(feedFactor, winterShare) x fedLimit.",
          "Attribution swaps planned, then land share, then fed limit, per cell between the window ends."
        ],
        monthly,
        attribution,
        byBiome,
        largestDrops: deltas.slice(0, 40)
      },
      null,
      2
    )}\n`
  );
  progress(`wrote ${output}`);
} finally {
  host.dispose();
}
