#!/usr/bin/env tsx
/**
 * T15 controlled Beer supply observation. Run each case in a fresh process.
 * Can also be copied unchanged into the section-29 historical source trees.
 * Usage: node --import tsx scripts/observeBeerSupply.mts input.fmg output.json
 *   --revision REV [--months 36] [--price-per-liter N] [--grain-per-liter N]
 * Overrides affect Beer alone after archive migration; initial market prices scale
 * with the catalogue value. No stock, population, treasury or labour is injected.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createNodeSimulationHost } from "../src/simulation/adapters/node";
import { getBurgProductionRecords, getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { LITERS_PER_BEER_LOT } from "../src/extensions/economy/generators/foodLots";
import { setGoodFlowObserver } from "../src/extensions/economy/generators/goodsBalanceLedger";
import { getAleDemandSnapshot } from "../src/extensions/economy/generators/foodProcessingLedger";
import { laborPointsForLots } from "../src/extensions/economy/generators/craftDemandCalibration";
import { getEconomyCalibrationState } from "../src/extensions/economy/state/economyCalibrationStore";

const [input, output, ...args] = process.argv.slice(2);
if (!input || !output) throw new Error("Expected input.fmg output.json --revision REV");
let months = 36;
let revision = "";
let pricePerLiter: number | undefined;
let grainPerLiter: number | undefined;
while (args.length) {
  const flag = args.shift();
  const value = args.shift();
  if (value === undefined) throw new Error(`Missing value for ${flag}`);
  if (flag === "--revision") revision = value;
  else if (flag === "--months") months = Number(value);
  else if (flag === "--price-per-liter") pricePerLiter = Number(value);
  else if (flag === "--grain-per-liter") grainPerLiter = Number(value);
  else throw new Error(`Unknown option: ${flag}`);
}
if (!revision || !Number.isSafeInteger(months) || months < 1) throw new Error("Invalid revision or month count");
for (const value of [pricePerLiter, grainPerLiter])
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error("Invalid override");

const bytes = readFileSync(input);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(bytes));
await host.prepare();
const world = host.world;
if (world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
const settings = { "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
const simulation = host.simulation as { worldSettings?: Record<string, string> };
simulation.worldSettings = { ...simulation.worldSettings, ...settings };
const beer = getGoods().find(good => good.name === "Beer");
if (!beer?.recipes) throw new Error("Missing Beer recipes");
const cerealIds = new Set(getGoods().filter(good => ["Barley", "Wheat", "Rye", "Oats"].includes(good.name)).map(good => good.i));
if (pricePerLiter !== undefined) {
  const value = pricePerLiter * LITERS_PER_BEER_LOT;
  const ratio = value / beer.value;
  for (const market of getMarkets()) {
    const row = market.goods[beer.i];
    if (row) row.price *= ratio;
  }
  beer.value = value;
}
if (grainPerLiter !== undefined) {
  for (const recipe of beer.recipes) {
    for (const id of cerealIds) if (id in recipe) recipe[id] = grainPerLiter * LITERS_PER_BEER_LOT;
  }
}
const contract = {
  unit: beer.unit,
  litersPerLot: LITERS_PER_BEER_LOT,
  value: beer.value,
  valuePerLiter: beer.value / LITERS_PER_BEER_LOT,
  recipes: structuredClone(beer.recipes),
  applyCalibration: getEconomyCalibrationState().applyCalibration,
  laborPointsPerLot: getEconomyCalibrationState().applyCalibration
    ? laborPointsForLots("Beer", 1, world.populationRate)
    : 1
};
type Amount = { units: number; value: number };
let flows: Record<string, Amount> = {};
let brewingInputs: Record<string, Amount> = {};
setGoodFlowObserver(flow => {
  const good = getGoods().find(good => good.i === flow.goodId);
  const price = getMarkets().find(market => market.i === flow.marketId)?.goods[flow.goodId]?.price ?? good?.value ?? 0;
  const add = (rows: Record<string, Amount>, key: string) => {
    const row = (rows[key] ??= { units: 0, value: 0 });
    row.units += flow.units;
    row.value += flow.units * price;
  };
  if (flow.goodId === beer.i) add(flows, `${flow.direction}:${flow.category}`);
  if (flow.category === "recipeInput" && flow.relatedGoodId === beer.i) add(brewingInputs, good?.name ?? String(flow.goodId));
});
function snapshot() {
  const markets = getMarkets().map(market => ({
    id: market.i,
    stock: market.goods[beer.i]?.stock ?? 0,
    price: market.goods[beer.i]?.price ?? beer.value,
    demand: getAleDemandSnapshot(market),
    ledger: structuredClone(market.foodProcessingLedger?.Beer),
    cumulativeBeerCaskReplacement: market.returnableContainerLedger?.cumulativeBeerCaskReplacement ?? 0
  }));
  const manufacture = { batches: 0, lots: 0, inputs: {} as Record<string, number> };
  for (const burg of world.pack.burgs) {
    if (!burg.i || burg.removed) continue;
    for (const record of getBurgProductionRecords(burg)) {
      if (!("recipe" in record) || record.goodId !== beer.i) continue;
      manufacture.batches++;
      manufacture.lots += record.units;
      for (const entry of record.recipe) {
        const name = getGoods().find(good => good.i === entry.goodId)?.name ?? String(entry.goodId);
        manufacture.inputs[name] = (manufacture.inputs[name] ?? 0) + entry.units;
      }
    }
  }
  const sample = {
    date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay],
    markets,
    stockLiters: markets.reduce((sum, market) => sum + market.stock * LITERS_PER_BEER_LOT, 0),
    manufacture,
    flows,
    brewingInputs
  };
  flows = {};
  brewingInputs = {};
  return sample;
}
const initial = snapshot();
const samples: ReturnType<typeof snapshot>[] = [];
try {
  for (let month = 0; month < months; month++) {
    host.advance({ months: 1 });
    await new Promise(done => setImmediate(done));
    if (beer.value !== contract.value || JSON.stringify(beer.recipes) !== JSON.stringify(contract.recipes))
      throw new Error("Beer override was changed during simulation");
    samples.push(snapshot());
    console.error(`[beer] ${month + 1}/${months}`);
  }
  writeFileSync(output, `${JSON.stringify({
    revision,
    observerSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),
    input: {
      name: basename(input),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      seed: world.seed,
      initialSettlementPattern: world.options.initialSettlementPattern,
      populationRate: world.populationRate
    },
    settings,
    months,
    overrides: { pricePerLiter, grainPerLiter },
    contract,
    notes: [
      "Flow values are stock valuations, not household cash payments.",
      "Household consumption and unmet demand ledgers are cumulative; subtract the initial ledger.",
      "Market snapshots are month-end observations; they exclude intra-month and in-transit stocks.",
      "Manufacture records are the latest production cycle; cumulative cask replacement independently checks their sum.",
      "source:burgCraft is direct market intake, not all manufactured output; local cargo can arrive as importArrival.",
      "Brewing inputs only include recorded market purchases attributed to Beer, not private inventory inputs."
    ],
    initial,
    samples
  }, null, 2)}\n`);
} finally {
  setGoodFlowObserver(null);
  host.dispose();
}
