/**
 * Wet-region pastoral economy, M3 (docs/plan/wet-region-pastoral-economy.md §3): over a long run,
 * each year's grazed herd capacity per person (World and the >=2,000 mm bands), the rural and urban
 * staple need met by the monthly Food Ledger settlement, and the livestock feed need left unmet.
 * Run on the same fixed input before and after a change to compare. Read-only.
 * Usage: auditWetRegionPastoralRun.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getCultivatedArea } from "../src/extensions/economy/context/agriculture";
import { getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { getDomesticatedCarryingCapacity } from "../src/extensions/economy/generators/faunaPopulation";
import * as husbandry from "../src/extensions/economy/generators/husbandry";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "24"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1)
  throw new Error("Usage: auditWetRegionPastoralRun.mts <archive.fmg> <output.json> [months]");

const WET_MM = 2000;
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const years: unknown[] = [];
let food = { ruralNeed: 0, ruralSupplied: 0, urbanNeed: 0, urbanSupplied: 0, feedRequiredKg: 0, feedUnmetKg: 0 };

function sampleMonth() {
  for (const market of getMarkets()) {
    const c = market.foodLedger?.monthlyConsumption;
    if (!c) continue;
    food.ruralNeed += Math.max(0, c.ruralNeed);
    food.ruralSupplied += Math.max(0, c.ruralSupplied);
    food.urbanNeed += Math.max(0, c.urbanNeed);
    food.urbanSupplied += Math.max(0, c.urbanSupplied);
  }
  for (const row of Object.values(getOrCreateLivestockFeedTable() ?? {})) {
    food.feedRequiredKg += Math.max(0, row.requiredKg ?? 0);
    food.feedUnmetKg += Math.max(0, row.unmetKg ?? 0);
  }
}

function sampleYear(month: number) {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const rate = world.populationRate || 1;
  const fields = getCultivatedArea();
  const grazed = getGoods().filter(good => husbandry.isGrazedLivestockGood(good.name));
  const all: Record<string, number> = { people: 0, cultivatedHa: 0, pastureKeptHa: 0 };
  const wet: Record<string, number> = { people: 0, cultivatedHa: 0, pastureKeptHa: 0 };
  for (const cell of cells.i) {
    if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
    const mm = (world.grid?.cells.prec?.[cells.g?.[cell] ?? cell] ?? 45) * 100;
    const rows = mm >= WET_MM ? [all, wet] : [all];
    const values: Record<string, number> = {
      people: cells.pop[cell] * rate,
      cultivatedHa: fields[cell] ?? 0,
      pastureKeptHa: husbandry.getPastureAreaUsedHectares(cell)
    };
    for (const good of grazed) values[good.name] = getDomesticatedCarryingCapacity(cell, good, 0);
    for (const row of rows) for (const [k, v] of Object.entries(values)) row[k] = (row[k] ?? 0) + v;
  }
  for (const burg of world.pack.burgs ?? [])
    if (burg?.i && !burg.removed) all.urbanPeople = (all.urbanPeople ?? 0) + Math.max(0, burg.population ?? 0) * rate;
  years.push({
    month,
    date: [host.simulation.currentYear, host.simulation.currentMonth],
    world: all,
    wet,
    lastTwelveMonths: {
      ...food,
      ruralMetShare: food.ruralNeed > 0 ? food.ruralSupplied / food.ruralNeed : 1,
      urbanMetShare: food.urbanNeed > 0 ? food.urbanSupplied / food.urbanNeed : 1,
      feedUnmetShare: food.feedRequiredKg > 0 ? food.feedUnmetKg / food.feedRequiredKg : 0
    }
  });
  food = { ruralNeed: 0, ruralSupplied: 0, urbanNeed: 0, urbanSupplied: 0, feedRequiredKg: 0, feedUnmetKg: 0 };
}

try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    sampleMonth();
    if (m % 12 === 0 || m === months) sampleYear(m);
    console.error(`[wet-pastoral-run] ${m}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        notes: [
          `Settled land cells; 'wet' = annual rainfall >= ${WET_MM} mm (100 mm proxy). People are rural; urbanPeople is burg population x populationRate.`,
          "Herd values are supported heads (carrying capacity after winter feed), real animals.",
          "lastTwelveMonths sums the monthly Food Ledger settlement (food-ledger units) and the livestock feed ledgers (kg DM) since the previous sample."
        ],
        years
      },
      null,
      1
    )}\n`
  );
} finally {
  host.dispose();
}
