/**
 * Wild-capture C0 audit (docs/plan/wild-animal-capture-domestication.md §6): each autumn, the pig and
 * horse shortfall of cells below target, the wild Game stock in those cells by biome tag, and spare
 * rural hands. Read-only; behaviour unchanged. Usage: auditWildCapture.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getMigratableAdults, getSeasonalLaborShortage } from "../src/extensions/economy/context/agriculture";
import { getOrCreateFaunaStockTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods } from "../src/extensions/economy/context/trade";
import {
  getAnnualHerdRenewal,
  getDomesticatedCarryingCapacity,
  WILD_SPECIES_KEY
} from "../src/extensions/economy/generators/faunaPopulation";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "48"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1)
  throw new Error("Usage: auditWildCapture.mts <archive.fmg> <output.json> [months]");
/** Candidate threshold from the design (§3.2); cells below it would capture. */
const CAPTURE_THRESHOLD = 0.9;
const AUTUMN_MONTHS = [9, 10];
const SPECIES = ["Pig", "Horses"];
const TAG_ORDER = ["forest", "wetland", "grassland", "scrub", "mountain", "cold", "dry", "desert"];
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  const samples: unknown[] = [];
  function snapshot() {
    const world = getWorldContext();
    const cells = world.pack.cells;
    const rate = world.populationRate || 1;
    const table = getOrCreateFaunaStockTable() ?? {};
    const spare = getMigratableAdults();
    const shortage = getSeasonalLaborShortage();
    const month = host.simulation.currentMonth - 1;
    const tagOf = (cell: number) => {
      const tags = world.biomesData.tags?.[cells.biomeCode[cell] ?? 0] ?? [];
      return TAG_ORDER.find(tag => tags.includes(tag as never)) ?? "other";
    };
    const species: Record<string, unknown> = {};
    for (const good of getGoods().filter(good => SPECIES.includes(good.name))) {
      const row = {
        targetHeads: 0,
        heads: 0,
        shortfallHeads: 0,
        shortCells: 0,
        sellingCells: 0,
        spareAdultsInShortCells: 0,
        laborShortCellsThisMonth: 0,
        wildHeadsInShortCellsByTag: {} as Record<string, number>,
        shortfallHeadsByTag: {} as Record<string, number>
      };
      for (const cell of cells.i) {
        if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
        const herd = table[`${cell}:${good.name}`];
        const heads = herd ? herd.young + herd.breeding + herd.old : 0;
        const target = getDomesticatedCarryingCapacity(cell, good, 0);
        row.targetHeads += target;
        row.heads += heads;
        if (herd && heads + (getAnnualHerdRenewal(cell, good)?.naturalNetHeads ?? 0) > target) row.sellingCells++;
        if (!(target > 0) || heads >= target * CAPTURE_THRESHOLD) continue;
        const tag = tagOf(cell);
        const gap = target * CAPTURE_THRESHOLD - heads;
        const wild = table[`${cell}:${WILD_SPECIES_KEY}`];
        row.shortfallHeads += gap;
        row.shortCells++;
        row.shortfallHeadsByTag[tag] = (row.shortfallHeadsByTag[tag] ?? 0) + gap;
        row.wildHeadsInShortCellsByTag[tag] =
          (row.wildHeadsInShortCellsByTag[tag] ?? 0) + (wild ? wild.young + wild.breeding + wild.old : 0);
        row.spareAdultsInShortCells += Math.max(0, spare[cell] ?? 0) * rate;
        if ((shortage[cell * 12 + month] ?? 0) > 0) row.laborShortCellsThisMonth++;
      }
      species[good.name] = row;
    }
    samples.push({ date: [host.simulation.currentYear, host.simulation.currentMonth], species });
  }
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    if (AUTUMN_MONTHS.includes(host.simulation.currentMonth)) snapshot();
    console.error(`[wild-capture] ${m}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        captureThreshold: CAPTURE_THRESHOLD,
        worldSettings: sim.worldSettings,
        notes: [
          "Real animals. Pig target is the yard target; Horses target is the supported grazed herd.",
          "Wild heads are the whole Game stock in short cells (all species); the design's ancestor shares apply on top.",
          "spareAdults is getMigratableAdults() x populationRate (adults free after the monthly peak and safety margin)."
        ],
        samples
      },
      null,
      1
    )}\n`
  );
} finally {
  host.dispose();
}
