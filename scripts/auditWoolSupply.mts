#!/usr/bin/env tsx
/** Audits wool supply, real herd heads and the shared grazing footprint; no calibration changes. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../src/simulation/adapters/node";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { getOrCreateFaunaStockTable, getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { calculateGrazingLandAllocation, getGrazedCarryingCapacity, getPastureAreaUsedHectares, STOCKING_DENSITY_PER_HECTARE } from "../src/extensions/economy/generators/husbandry";
import { HOUSEHOLD_GARMENT_NAMES } from "../src/extensions/economy/generators/textileRecipeContracts";
import { getMarketBlanketDemandProfile, getMarketTextileDemandProfile } from "../src/extensions/economy/generators/textileDemand";
import { getAnnualWoolPotentialKg, getWoolOutput } from "../src/extensions/economy/generators/woolProduction";
import { SHEEP_ANNUAL_WOOL_KG, WOOL_KG_PER_MARKET_LOT } from "../src/extensions/economy/generators/woolProductionPolicy";
import { setGoodFlowObserver } from "../src/extensions/economy/generators/goodsBalanceLedger";

const [input, output, length = "12"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1) throw new Error("Invalid arguments");
const paths = ["scripts/auditWoolSupply.mts", "src/extensions/economy/generators/woolProduction.ts", "src/extensions/economy/generators/husbandry.ts", "src/extensions/economy/generators/faunaPopulation.ts", "src/extensions/economy/generators/developmentPotential.ts"];
paths.push("src/extensions/economy/generators/textileDemand.ts", "src/extensions/economy/generators/textileRecipeContracts.ts", "src/extensions/economy/generators/goods-generator.ts", "src/extensions/economy/generators/production-generator.ts", "src/extensions/economy/generators/markets-generator.ts");
paths.push("src/extensions/economy/generators/ruralTextileProduction.ts", "src/extensions/economy/generators/ruralTextileChains.ts", "src/extensions/economy/generators/textileHouseholdPolicy.ts", "src/extensions/economy/generators/ruralOccupationAllocation.ts");
paths.push(...["woolProductionPolicy.ts", "livestockFeed.ts", "livestockFeedPolicy.ts", "livestockFeedState.ts", "dairy.ts", "production-utils.ts"].map(name => `src/extensions/economy/generators/${name}`));
const sourceHashes = Object.fromEntries(paths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(bytes));
await host.prepare();
if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
const sim = host.simulation as { worldSettings?: Record<string, string> };
sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
const wool = getGoods().find(good => good.name === "Wool")!;
// Model ecological densities, not observed historical stocking rates.
const modelDensity = STOCKING_DENSITY_PER_HECTARE;
let woolFlows: Record<string, number> = {};
const wardrobeIds = new Set(getGoods().filter(good => HOUSEHOLD_GARMENT_NAMES.has(good.name)).map(good => good.i));
const blanket = getGoods().find(good => good.name === "Wool Blankets");
let householdBlankets = 0;
let householdWardrobes = 0;
setGoodFlowObserver(flow => {
 if (flow.direction === "sink" && flow.category === "householdTextiles") {
   if (wardrobeIds.has(flow.goodId)) householdWardrobes += flow.units;
   if (flow.goodId === blanket?.i) householdBlankets += flow.units;
 }
 if (flow.goodId !== wool.i || flow.direction === "transfer") return;
 const key = `${flow.direction}:${flow.category}`;
 woolFlows[key] = (woolFlows[key] ?? 0) + flow.units;
});
function snapshot() {
 const world = host.world;
 const table = getOrCreateFaunaStockTable() ?? {};
 const heads: Record<string, number> = {};
 const sheepCohorts = { young: 0, breeding: 0, old: 0 };
 const occupied = [];
 const feedRows = Object.values(getOrCreateLivestockFeedTable() ?? {});
 const feedTotals = Object.fromEntries([
  "hayKg", "pastureGrownKg", "harvestedKg", "harvestLossKg", "storageLossKg", "unharvestedKg",
  "soldKg", "purchasedKg", "requiredKg", "pastureConsumedKg", "hayConsumedKg", "unmetKg", "spending", "revenue"
 ].map(key => [key, feedRows.reduce((sum, row) => sum + (Number(row[key as keyof typeof row]) || 0), 0)]));
 const feedCapacityHeads: Record<string, number> = {};
 let pastureHa = 0;
 let footprintHa = 0;
 let allocatedPastureHa = 0;
 const landCapacityHeads: Record<string, number> = {};
 let woolLotsPerMonth = 0;
 let annualWoolPotentialKg = 0;
 for (const cellId of world.pack.cells.i) {
  const ha = getPastureAreaUsedHectares(cellId);
  pastureHa += ha;
  const allocations = calculateGrazingLandAllocation(world, cellId, ha);
  allocatedPastureHa += allocations.reduce((sum, row) => sum + row.areaHa, 0);
  for (const row of allocations) {
   landCapacityHeads[row.goodName] = (landCapacityHeads[row.goodName] ?? 0) + row.capacityHeads;
   feedCapacityHeads[row.goodName] = (feedCapacityHeads[row.goodName] ?? 0) + (getGrazedCarryingCapacity(cellId, getGoods().find(good => good.name === row.goodName)!) ?? 0);
  }
  let claim = 0;
  const localHeads: Record<string, number> = {};
  for (const [name, density] of Object.entries(modelDensity)) {
   const herd = table[`${cellId}:${name}`];
   const count = herd ? herd.young + herd.breeding + herd.old : 0;
   heads[name] = (heads[name] ?? 0) + count;
   if (name === "Sheep" && herd) {
    sheepCohorts.young += herd.young;
    sheepCohorts.breeding += herd.breeding;
    sheepCohorts.old += herd.old;
   }
   localHeads[name] = count;
   claim += count / density;
  }
  footprintHa += claim;
  woolLotsPerMonth += getWoolOutput(cellId);
  annualWoolPotentialKg += getAnnualWoolPotentialKg(cellId);
  if (claim > 0) occupied.push({cellId, pastureHa: ha, footprintHa: claim, occupancy: ha > 0 ? claim / ha : null, heads: localHeads, allocations});
 }
 const ruralPeople = Array.from(world.pack.cells.pop).reduce((sum, points) => sum + Math.max(0, points), 0) * world.populationRate;
 const urbanPeople = world.pack.burgs.reduce((sum, burg) => sum + (burg?.i && !burg.removed ? Math.max(0, burg.population ?? 0) : 0), 0) * world.populationRate * (world.urbanization ?? 1);
 const stockLots = getMarkets().reduce((sum, market) => sum + Math.max(0, market.goods[wool.i]?.stock ?? 0), 0);
 const result = { date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay], ruralPeople, urbanPeople,
  heads, sheepCohorts, sheepPerResident: heads.Sheep / (ruralPeople + urbanPeople), pastureHa, footprintHa, allocatedPastureHa, landCapacityHeads, feedCapacityHeads, feedTotals,
  aggregateOccupancy: pastureHa > 0 ? footprintHa / pastureHa : null,
  occupiedCells: occupied.length, cellsOverModelFootprint: occupied.filter(cell => cell.occupancy === null || cell.occupancy > 1.01).length,
  worstCells: occupied.sort((a,b) => (b.occupancy ?? Infinity) - (a.occupancy ?? Infinity)).slice(0, 10),
  monthlyWardrobeDemandLots: getMarkets().reduce((sum, market) => sum + getMarketTextileDemandProfile(market.i).monthlyDemand, 0),
  householdWardrobeConsumptionLots: householdWardrobes,
  monthlyBlanketDemandLots: getMarkets().reduce((sum, market) => sum + getMarketBlanketDemandProfile(market.i).monthlyDemand, 0),
  householdBlanketConsumptionLots: householdBlankets,
  ruralHomeWardrobesLots: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.garments ?? 0), 0),
  ruralHomeBlanketsLots: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.blankets ?? 0), 0),
  ruralTextileLaborCapacity: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.laborCapacity ?? 0), 0),
  ruralTextileLaborUsed: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.laborUsed ?? 0), 0),
  householdWardrobeSpending: getMarkets().reduce((sum, market) => sum + (market.textileLedger?.householdSpending ?? 0), 0),
  householdBlanketSpending: getMarkets().reduce((sum, market) => sum + (market.blanketLedger?.householdSpending ?? 0), 0),
  annualWoolPotentialKg,
  effectiveWoolLaborAndFeedCoverage: annualWoolPotentialKg > 0 ? woolLotsPerMonth * WOOL_KG_PER_MARKET_LOT * 12 / annualWoolPotentialKg : 0,
  woolLotsPerMonth, woolKgPerMonth: woolLotsPerMonth * WOOL_KG_PER_MARKET_LOT, woolStockLots: stockLots, woolStockKg: stockLots * WOOL_KG_PER_MARKET_LOT, woolFlows };
 woolFlows = {}; householdWardrobes = 0; householdBlankets = 0;
 return result;
}
const initial = snapshot();
const samples = [];
try {
 for (let i = 0; i < months; i++) {
  host.advance({ months: 1 });
  await new Promise(done => setImmediate(done));
  samples.push(snapshot());
  console.error(`[wool-supply] ${i + 1}/${months}`);
 }
 writeFileSync(output, JSON.stringify({ inputSha256: createHash("sha256").update(bytes).digest("hex"), seed: host.world.seed,
  settlementPattern: host.world.options.initialSettlementPattern, worldSettings: sim.worldSettings, sourceHashes, modelDensity, sheepAnnualWoolKg: SHEEP_ANNUAL_WOOL_KG, woolKgPerLot: WOOL_KG_PER_MARKET_LOT,
  notes: ["Footprint is sum(heads/model heads per hectare); it diagnoses simultaneous claims against the code's own ceilings, not an empirical carrying-capacity estimate.", "Headcounts include young cohorts. Monthly yield is a smoothed forecast; recorded ruralHarvest is actual market inflow.", "Stocks are market-only. Population is real residents; claims and occupied-cell examples are snapshots."], initial, samples }, null, 2) + "\n");
} finally { setGoodFlowObserver(null); host.dispose(); }
