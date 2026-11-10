/**
 * Wet-region pastoral economy, herd food (docs/plan/wet-region-pastoral-economy.md §4): per rainfall
 * band, the food energy the herds actually give (milk as produced by dairy.ts, and a meat offtake
 * estimate from the standing herd) against the milk-and-meat diet share assumed from rainfall
 * (wetPastoralDietShare) and against all non-grain food the Food Ledger does not ask grain for.
 * Each 12-month window is summed. Read-only.
 * Usage: auditWetRegionHerdFood.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getRuralFoodCapacity } from "../src/extensions/economy/context/agriculture";
import { getOrCreateFaunaStockTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getMilkOutput } from "../src/extensions/economy/generators/dairy";
import { LITERS_PER_MILK_LOT } from "../src/extensions/economy/generators/foodLots";
import { DAILY_CALORIC_NEED_KCAL, MILK_KCAL_PER_LITER } from "../src/extensions/economy/generators/nutritionAudit";
import { getRuralGrainDietShare } from "../src/extensions/economy/generators/ruralDiet";
import { WINTER_SLAUGHTER_POLICY } from "../src/extensions/economy/generators/winterSlaughterPolicy";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "24"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 12)
  throw new Error("Usage: auditWetRegionHerdFood.mts <archive.fmg> <output.json> [months>=12]");

/** Audit assumptions, not model constants: yearly offtake of the standing herd and edible kg per head. */
const OFFTAKE: Record<string, { share: number; edibleKg: number }> = {
  Cattle: { share: 0.15, edibleKg: 110 },
  Sheep: { share: 0.25, edibleKg: 10.6 },
  Goats: { share: 0.25, edibleKg: 9 }
};
const BANDS = [0, 400, 1200, 2000, 3000];
const KCAL_PER_PERSON_YEAR = DAILY_CALORIC_NEED_KCAL * 365;

const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const windows: unknown[] = [];
let milkKcal: Float64Array | null = null;

function bandOf(mm: number) {
  let band = 0;
  for (let i = 0; i < BANDS.length; i++) if (mm >= BANDS[i]) band = i;
  return band;
}

function sampleMonth() {
  const cells = getWorldContext().pack.cells;
  milkKcal ??= new Float64Array(cells.i.length);
  for (const cell of cells.i)
    if (cells.h[cell] >= 20) milkKcal[cell] += getMilkOutput(cell) * LITERS_PER_MILK_LOT * MILK_KCAL_PER_LITER;
}

function sampleWindow(month: number) {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const rate = world.populationRate || 1;
  const stock = getOrCreateFaunaStockTable() ?? {};
  const fieldCapacity = getRuralFoodCapacity();
  const rows = BANDS.map(mm => ({
    fromMm: mm,
    people: 0,
    wetCells: 0,
    assumedWetKcal: 0,
    assumedNonGrainKcal: 0,
    milkKcal: 0,
    meatKcal: 0,
    wetCellPeople: 0,
    wetCellAssumedKcal: 0,
    wetCellHerdKcal: 0,
    heads: {} as Record<string, number>,
    breeding: {} as Record<string, number>
  }));
  const perCell: number[][] = [];
  for (const cell of cells.i) {
    if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
    const mm = (world.grid?.cells.prec?.[cells.g?.[cell] ?? cell] ?? 45) * 100;
    const row = rows[bandOf(mm)];
    const people = cells.pop[cell] * rate;
    const wet = cells.wetPastoralDietShare?.[cell] ?? 0;
    const grain = getRuralGrainDietShare(cells, cell, fieldCapacity);
    let meat = 0;
    for (const [species, { share, edibleKg }] of Object.entries(OFFTAKE)) {
      const herd = stock[`${cell}:${species}`];
      if (herd) {
        row.heads[species] = (row.heads[species] ?? 0) + herd.young + herd.breeding + herd.old;
        row.breeding[species] = (row.breeding[species] ?? 0) + herd.breeding;
      }
      if (herd) meat += (herd.young + herd.breeding + herd.old) * share * edibleKg * WINTER_SLAUGHTER_POLICY.dietaryKcalPerKg;
    }
    const milk = milkKcal?.[cell] ?? 0;
    row.people += people;
    row.assumedWetKcal += people * wet * KCAL_PER_PERSON_YEAR;
    row.assumedNonGrainKcal += people * (1 - grain) * KCAL_PER_PERSON_YEAR;
    row.milkKcal += milk;
    row.meatKcal += meat;
    if (wet > 0) {
      row.wetCells++;
      row.wetCellPeople += people;
      row.wetCellAssumedKcal += people * wet * KCAL_PER_PERSON_YEAR;
      row.wetCellHerdKcal += milk + meat;
      perCell.push([cell, Math.round(mm), Math.round(people), +wet.toFixed(3), +((milk + meat) / (people * KCAL_PER_PERSON_YEAR)).toFixed(3)]);
    }
  }
  windows.push({ date: [host.simulation.currentYear, host.simulation.currentMonth], month, bands: rows, wetCells: perCell });
  milkKcal = null;
}

try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    sampleMonth();
    if (m % 12 === 0) sampleWindow(m);
    await new Promise(done => setImmediate(done));
    console.error(`[herd-food] ${m}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify({
      schemaVersion: 1,
      inputSha256: createHash("sha256").update(bytes).digest("hex"),
      months,
      kcalPerPersonYear: KCAL_PER_PERSON_YEAR,
      offtakeAssumptions: OFFTAKE,
      notes: [
        "Bands by annual rainfall (mm, from). Kcal per 12-month window. Milk is dairy.ts output (care- and feed-gated), before cheese-making losses or calves.",
        "Meat = standing herd x offtake share x edible kg x 2,000 kcal/kg (audit assumption). wetCells rows: [cell, mm, people, wetPastoralDietShare, herd kcal / people need]."
      ],
      windows
    })}\n`
  );
} finally {
  host.dispose();
}
