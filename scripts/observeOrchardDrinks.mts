#!/usr/bin/env tsx
/** T14: observe actual orchard harvests separately from market output and purchases.
 * Usage: node --import tsx scripts/observeOrchardDrinks.mts input.fmg output.json
 *        [--months 36] [--pear-fixture]
 * --pear-fixture changes precipitation in at most 12 populated grid cells where
 * the existing crop selector then chooses Pears. No goods or workers are injected.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createNodeSimulationHost } from "../src/simulation/adapters/node";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { getOrCreateCumulativeCellFoodFlows } from "../src/extensions/economy/context/cellTables";
import { getPerennialCropMix } from "../src/extensions/economy/generators/viticulture";
import type { FoodProcessingLedger } from "../src/extensions/economy/generators/marketTypes";
import { createObserveViews } from "./lib/observeViews.mts";

const [input, output, ...args] = process.argv.slice(2);
if (!input || !output) throw new Error("Expected input.fmg output.json [--months N] [--pear-fixture]");
let months = 36;
let pearFixture = false;
while (args.length) {
  const flag = args.shift();
  if (flag === "--pear-fixture") pearFixture = true;
  else if (flag === "--months") months = Number(args.shift());
  else throw new Error(`Unknown option: ${flag}`);
}
if (!Number.isSafeInteger(months) || months < 1) throw new Error("Invalid month count");
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(bytes));
await host.prepare();
const world = host.world;
if (world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
const settings = { "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
const simulation = host.simulation as { worldSettings?: Record<string, string> };
simulation.worldSettings = { ...simulation.worldSettings, ...settings };
const precipitationChanges: { gridCell: number; before: number; after: number }[] = [];
if (pearFixture) {
  const touched = new Set<number>();
  for (const cell of world.pack.cells.i) {
    if (precipitationChanges.length >= 12) break;
    if (!(world.pack.cells.pop[cell] > 0) || !(world.pack.cells.state[cell] > 0)) continue;
    const grid = world.pack.cells.g[cell];
    if (touched.has(grid)) continue;
    touched.add(grid);
    const before = world.grid.cells.prec[grid];
    world.grid.cells.prec[grid] = 8;
    if (getPerennialCropMix(world, cell)[0]?.good.name === "Pears")
      precipitationChanges.push({ gridCell: grid, before, after: 8 });
    else world.grid.cells.prec[grid] = before;
  }
  if (!precipitationChanges.length) throw new Error("No viable pear fixture cells found");
}
const names = new Set(["Apples", "Pears", "Cider", "Perry", "Dried Fruits", "Barrels"]);
function orchards() {
  const result: Record<string, { cells: number; hectares: number }> = {};
  for (const cell of world.pack.cells.i) {
    for (const entry of getPerennialCropMix(world, cell)) {
      if (!names.has(entry.good.name)) continue;
      const row = (result[entry.good.name] ??= { cells: 0, hectares: 0 });
      row.cells++;
      row.hectares += entry.areaHectares;
    }
  }
  return result;
}
const observe = createObserveViews(
  () => host.world,
  () => ({
    year: host.simulation.currentYear,
    month: host.simulation.currentMonth,
    day: host.simulation.currentDay,
    tick: host.simulation.tickCount
  })
);
function snapshot() {
  const trade = observe.trade();
  const cumulative = getOrCreateCumulativeCellFoodFlows() ?? {};
  return {
    date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay],
    orchards: orchards(),
    goods: trade.byGood
      .filter(good => names.has(good.name))
      .map(good => ({
        ...good,
        cumulativeHarvested: cumulative[good.id]?.harvested ?? 0,
        cumulativeProcessed: cumulative[good.id]?.processed ?? 0,
        householdConsumption: getMarkets().reduce(
          (sum, market) =>
            sum + (market.foodProcessingLedger?.[good.name as keyof FoodProcessingLedger]?.householdConsumption ?? 0),
          0
        ),
        containers:
          good.name === "Cider" || good.name === "Perry"
            ? getMarkets().map(market => ({
                marketId: market.i,
                ledger: market.returnableContainerLedger?.orchardCasks?.[good.name as "Cider" | "Perry"]
              }))
            : undefined
      }))
  };
}
const initial = snapshot();
const samples: ReturnType<typeof snapshot>[] = [];
for (let month = 0; month < months; month++) {
  host.advance({ months: 1 });
  await new Promise(done => setImmediate(done));
  samples.push(snapshot());
  console.error(`[orchard] ${month + 1}/${months}`);
}
const goods = getGoods()
  .filter(good => names.has(good.name))
  .map(good => ({
    id: good.i,
    name: good.name,
    unit: good.unit,
    value: good.value,
    recipes: good.recipes,
    finalMarkets: getMarkets().map(market => ({
      id: market.i,
      stock: market.goods[good.i]?.stock ?? 0,
      price: market.goods[good.i]?.price ?? good.value
    }))
  }));
writeFileSync(
  output,
  `${JSON.stringify(
    {
      revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      input: {
        name: basename(input),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        seed: world.seed,
        initialSettlementPattern: world.options.initialSettlementPattern,
        populationRate: world.populationRate
      },
      settings,
      months,
      fixture: pearFixture
        ? {
            precipitationChanges,
            note: "Controlled precipitation fixture, not an unmodified generated map. No stock, recipes, prices or labour injected."
          }
        : null,
      notes: [
        "Flows value goods at recorded market prices; these are not household cash payments.",
        "Market stock excludes source-cell food reserves. Harvest includes actual source-cell use before market intake.",
        "Purchase sink categories, global deals and physical departure legs are separate observations.",
        "Orchard hectares are selected area before staffing, not a guarantee of harvested output."
      ],
      goods,
      initial,
      samples
    },
    null,
    2
  )}\n`
);
host.dispose();
