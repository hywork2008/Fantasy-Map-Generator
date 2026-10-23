#!/usr/bin/env tsx
import { isGoodEnabled } from "../src/extensions/economy/generators/goods-generator";
/** Audits wool supply, real herd heads and the shared grazing footprint; no calibration changes. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { getGoods, getMarkets, getOrCreateTextileCommissionTable } from "../src/extensions/economy/context/trade";
import { getOrCreateFaunaStockTable, getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { calculateGrazingLandAllocation, getGrazedCarryingCapacity, getPastureAreaUsedHectares, STOCKING_DENSITY_PER_HECTARE } from "../src/extensions/economy/generators/husbandry";
import { HOUSEHOLD_GARMENT_NAMES } from "../src/extensions/economy/generators/textileRecipeContracts";
import { cloneTextileLedgerObservation, getMarketBlanketDemandProfile, getMarketTextileDemandProfile, getTextileMarketOrders } from "../src/extensions/economy/generators/textileDemand";
import { getAnnualWoolPotentialKg, getWoolOutput } from "../src/extensions/economy/generators/woolProduction";
import { SHEEP_ANNUAL_WOOL_KG, WOOL_KG_PER_MARKET_LOT } from "../src/extensions/economy/generators/woolProductionPolicy";
import { getUrbanCraftCapacityRecords, getUrbanTextileHandworkReference } from "../src/extensions/economy/generators/urbanCraftCapacity";
import { setGoodFlowObserver } from "../src/extensions/economy/generators/goodsBalanceLedger";

import { createObserveViews } from "./lib/observeViews.mts";
import { setTickStepObserver } from "../src/generators/tickProfiler";
import { getCultivatedArea } from "../src/extensions/economy/context/agriculture";
import { getRuralHouseholdFoodStock } from "../src/extensions/economy/context/agriculture";
import { getMarketCellColumn } from "../src/extensions/economy/context/cellTables";
import { GOOD_MEASURES, WAIN_KG } from "../src/extensions/economy/generators/goodMeasureCatalog";
import { getFoodImportAttempts, getFoodImportFlows } from "../src/extensions/economy/generators/foodImportNetwork";

const [input, output, length = "12"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1) throw new Error("Invalid arguments");
const paths = ["scripts/auditWoolSupply.mts", "src/extensions/economy/generators/woolProduction.ts", "src/extensions/economy/generators/husbandry.ts", "src/extensions/economy/generators/faunaPopulation.ts", "src/extensions/economy/generators/developmentPotential.ts"];
paths.push("src/extensions/economy/generators/textileDemand.ts", "src/extensions/economy/generators/textileRecipeContracts.ts", "src/extensions/economy/generators/goods-generator.ts", "src/extensions/economy/generators/production-generator.ts", "src/extensions/economy/generators/markets-generator.ts");
paths.push("src/extensions/economy/generators/ruralTextileProduction.ts", "src/extensions/economy/generators/ruralTextileChains.ts", "src/extensions/economy/generators/textileHouseholdPolicy.ts", "src/extensions/economy/generators/ruralOccupationAllocation.ts");
paths.push(...["woolProductionPolicy.ts", "livestockFeed.ts", "livestockFeedPolicy.ts", "livestockFeedState.ts", "dairy.ts", "production-utils.ts"].map(name => `src/extensions/economy/generators/${name}`));
paths.push("src/extensions/economy/generators/urbanCraftCapacity.ts", "src/extensions/economy/generators/urbanCraftCapacityTypes.ts", "src/extensions/economy/context/trade.ts", "src/extensions/economy/generators/craftDemandCalibration.ts", "src/extensions/economy/generators/craftScale.ts");
paths.push("src/extensions/economy/generators/textileCommissions.ts", "src/extensions/economy/generators/textileCommissionTypes.ts", "src/extensions/economy/generators/strategicLaborMarkets.ts", "src/extensions/economy/generators/subsistenceWage.ts");
paths.push("src/extensions/economy/generators/productionDiagnostics.ts", "src/extensions/economy/generators/foodObservation.ts");
paths.push(...execFileSync("git", ["ls-files", "-z", "src", "scripts", "public", "package-lock.json"])
 .toString().split("\0").filter(path => path && !path.startsWith("src/city-generator/")));
const sourceHashes = Object.fromEntries([...new Set(paths)].sort().map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(bytes));
await host.prepare();
if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
const sim = host.simulation as { worldSettings?: Record<string, string> };
sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
const clock = () => ({year: host.simulation.currentYear, month: host.simulation.currentMonth, day: host.simulation.currentDay, tick: host.simulation.tickCount});
const views = createObserveViews(() => host.world, clock);
const initialProfile = { options: structuredClone(host.world.options), populationRate: host.world.populationRate,
 urbanization: host.world.urbanization, goods: getGoods().map(good => ({id: good.i, name: good.name, enabled: isGoodEnabled(good)})), extensions: Object.fromEntries(["economy", "characters", "nobility", "shipbuilding"].map(id => [id, host.enablement.isEnabled(id)])) };
let textileSettlements: {date: ReturnType<typeof clock>; textiles: ReturnType<typeof views.textiles>}[] = [];
let foodSettlements: {date: ReturnType<typeof clock>; markets: unknown; food: ReturnType<typeof views.food>}[] = [];
let foodImportSettlements: unknown[] = [];
setTickStepObserver({ enter() {}, exit(label) {
 if (label === "food:production") foodImportSettlements.push({date: clock(),
  attempts: structuredClone(getFoodImportAttempts()), flows: structuredClone(getFoodImportFlows()),
  markets: views.wealth().markets});
 if (label === "production:householdTextiles") textileSettlements.push({date: clock(), textiles: views.textiles()});
 if (label === "production:foodConsumption" || label === "food:consumption") {
  foodSettlements.push({date: clock(), food: views.food(), markets: views.wealth().markets.map(market => ({ ...market,
   ruralPeople: Array.from(host.world.pack.cells.i).reduce((sum, id) => sum +
    (host.world.pack.cells.h[id] >= 20 && getMarketCellColumn()[id] === market.id ? Math.max(0, host.world.pack.cells.pop[id]) * host.world.populationRate : 0), 0),
   urbanPeople: host.world.pack.burgs.reduce((sum, burg) => sum +
    (burg?.i && !burg.removed && burg.market === market.id ? Math.max(0, burg.population ?? 0) * host.world.populationRate * (host.world.urbanization ?? 1) : 0), 0)
  }))});
 }
}});
let primaryFlows: Record<string, Record<string, number>> = {};
const namesById = new Map(getGoods().map(good => [good.i, good.name]));
const wool = getGoods().find(good => good.name === "Wool")!;
// Model ecological densities, not observed historical stocking rates.
const modelDensity = STOCKING_DENSITY_PER_HECTARE;
let woolFlows: Record<string, number> = {};
let textileFlows: Record<string, Record<string, number>> = {};
const textileNames = new Set(["Wool", "Flax", "Hemp", "Cotton", "Cloth", "Linen", "Wool Cloth", "Wool Garments", "Linen Garments", "Garments", "Wool Blankets"]);
const textileNameById = new Map(getGoods().filter(good => textileNames.has(good.name)).map(good => [good.i, good.name]));
const wardrobeIds = new Set(getGoods().filter(good => HOUSEHOLD_GARMENT_NAMES.has(good.name)).map(good => good.i));
const blanket = getGoods().find(good => good.name === "Wool Blankets");
let householdBlankets = 0;
let householdWardrobes = 0;
setGoodFlowObserver(flow => {
 if (flow.direction !== "transfer") {
  const totals = primaryFlows[namesById.get(flow.goodId) ?? String(flow.goodId)] ??= {};
  const key = `${flow.direction}:${flow.category}`;
  totals[key] = (totals[key] ?? 0) + flow.units;
 }
 const textileName = textileNameById.get(flow.goodId);
 if (textileName && flow.direction !== "transfer") {
  const totals = textileFlows[textileName] ??= {};
  const key = `${flow.direction}:${flow.category}`;
  totals[key] = (totals[key] ?? 0) + flow.units;
 }
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
 const ruralTextileInputOrders: Record<string, number> = {};
 const ruralTextileInputPurchases: Record<string, number> = {};
 for (const market of getMarkets()) {
  for (const [id, units] of Object.entries(getTextileMarketOrders(market).inputs)) {
   const name = getGoods().find(good => good.i === +id)?.name ?? id;
   ruralTextileInputOrders[name] = (ruralTextileInputOrders[name] ?? 0) + units;
  }
  for (const [id, units] of Object.entries(market.ruralTextileProduction?.inputOrders ?? {})) {
   const name = getGoods().find(good => good.i === +id)?.name ?? id;
   ruralTextileInputPurchases[name] = (ruralTextileInputPurchases[name] ?? 0) + units;
  }
 }
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
 const intervalTextiles = textileSettlements; textileSettlements = [];
 const intervalFood = foodSettlements; foodSettlements = [];
 const intervalFoodImports = foodImportSettlements; foodImportSettlements = [];
 const intervalPrimary = primaryFlows; primaryFlows = {};
 const marketIds = new Set(getMarkets().filter(market => market.foodLedger).map(market => market.i));
 const marketColumn = getMarketCellColumn();
 const ruralFoodUncoveredPeople = Array.from(world.pack.cells.i).reduce((sum, id) => sum +
  (world.pack.cells.h[id] >= 20 && !marketIds.has(marketColumn[id]) ? Math.max(0, world.pack.cells.pop[id]) * world.populationRate : 0), 0);
 const result = { food: views.food(), textileSettlements: intervalTextiles, foodSettlements: intervalFood,
  foodImportSettlements: intervalFoodImports, primaryFlows: intervalPrimary,
  cultivatedHa: Array.from(getCultivatedArea()).reduce((sum, ha) => sum + Math.max(0, ha), 0),
  ruralFoodUncoveredPeople,
  ruralFoodStock: Array.from(getRuralHouseholdFoodStock()).reduce((sum, units) => sum + Math.max(0, units), 0),
  markets: getMarkets().map(market => ({id: market.i, food: structuredClone(market.foodLedger ?? null),
   textile: cloneTextileLedgerObservation(market.textileLedger), blanket: cloneTextileLedgerObservation(market.blanketLedger),
   ruralTextiles: structuredClone(market.ruralTextileProduction ?? null), goods: structuredClone(market.goods)})),
  wealth: views.wealth(),
  date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay], ruralPeople, urbanPeople,
  heads, sheepCohorts, sheepPerResident: heads.Sheep / (ruralPeople + urbanPeople), pastureHa, footprintHa, allocatedPastureHa, landCapacityHeads, feedCapacityHeads, feedTotals,
  aggregateOccupancy: pastureHa > 0 ? footprintHa / pastureHa : null,
  occupiedCells: occupied.length, cellsOverModelFootprint: occupied.filter(cell => cell.occupancy === null || cell.occupancy > 1.01).length,
  worstCells: occupied.sort((a,b) => (b.occupancy ?? Infinity) - (a.occupancy ?? Infinity)).slice(0, 10),
  monthlyWardrobeDemandLots: getMarkets().reduce((sum, market) => sum + getMarketTextileDemandProfile(market.i).monthlyDemand, 0),
  householdWardrobeConsumptionLots: householdWardrobes,
  householdWardrobeLedgerDemandLots: getMarkets().reduce((sum, market) => sum + (market.textileLedger?.monthlyDemand ?? 0), 0),
  householdWardrobeUrbanConsumptionLots: getMarkets().reduce((sum, market) => sum + (market.textileLedger?.urbanConsumption ?? 0), 0),
  householdWardrobeRuralConsumptionLots: getMarkets().reduce((sum, market) => sum + (market.textileLedger?.ruralConsumption ?? 0), 0),
  householdWardrobeUnmetLots: getMarkets().reduce((sum, market) => sum + (market.textileLedger?.unmetDemand ?? 0), 0),
  monthlyBlanketDemandLots: getMarkets().reduce((sum, market) => sum + getMarketBlanketDemandProfile(market.i).monthlyDemand, 0),
  householdBlanketConsumptionLots: householdBlankets,
  householdBlanketLedgerDemandLots: getMarkets().reduce((sum, market) => sum + (market.blanketLedger?.monthlyDemand ?? 0), 0),
  householdBlanketUnmetLots: getMarkets().reduce((sum, market) => sum + (market.blanketLedger?.unmetDemand ?? 0), 0),
  ruralHomeWardrobesLots: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.garments ?? 0), 0),
  ruralHomeBlanketsLots: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.blankets ?? 0), 0),
  ruralPurchasedClothWardrobesLots: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.purchasedClothGarments ?? 0), 0),
  ruralPurchasedClothBlanketsLots: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.purchasedClothBlankets ?? 0), 0),
  ruralPurchasedClothSpending: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.purchasedClothSpending ?? 0), 0),
  ruralTextileInputOrders, ruralTextileInputPurchases,
  beddingDiagnostics: getMarkets().flatMap(market => market.ruralTextileProduction?.beddingDiagnostic
    ? [{ marketId: market.i, ...market.ruralTextileProduction.beddingDiagnostic,
         householdBlanketConsumptionLots: market.blanketLedger?.householdConsumption ?? 0,
         householdBlanketUnmetLots: market.blanketLedger?.unmetDemand ?? 0 }]
    : []),
  textileCommissions: Object.values(getOrCreateTextileCommissionTable() ?? {}),
  urbanCraftCapacity: getUrbanCraftCapacityRecords().map(({productionDiagnostics: _diagnostics, ...row}) => ({ ...row,
    workforcePeople: row.workforcePoints * row.populationRate,
    chargedPeople: row.chargedPoints * row.populationRate,
    unusedPeople: row.unusedPoints * row.populationRate,
    textilePeople: row.textilePoints * row.populationRate,
    handworkReferenceLots: getUrbanTextileHandworkReference(row) })),
  ruralTextileLaborCapacity: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.laborCapacity ?? 0), 0),
  ruralTextileLaborUsed: getMarkets().reduce((sum, market) => sum + (market.ruralTextileProduction?.laborUsed ?? 0), 0),
  householdWardrobeSpending: getMarkets().reduce((sum, market) => sum + (market.textileLedger?.householdSpending ?? 0), 0),
  householdBlanketSpending: getMarkets().reduce((sum, market) => sum + (market.blanketLedger?.householdSpending ?? 0), 0),
  annualWoolPotentialKg,
  effectiveWoolLaborAndFeedCoverage: annualWoolPotentialKg > 0 ? woolLotsPerMonth * WOOL_KG_PER_MARKET_LOT * 12 / annualWoolPotentialKg : 0,
  woolLotsPerMonth, woolKgPerMonth: woolLotsPerMonth * WOOL_KG_PER_MARKET_LOT, woolStockLots: stockLots, woolStockKg: stockLots * WOOL_KG_PER_MARKET_LOT, woolFlows, textileFlows };
 woolFlows = {}; textileFlows = {}; householdWardrobes = 0; householdBlankets = 0;
 return result;
}
const initial = snapshot();
const samples = [];
try {
 for (let i = 0; i < months; i++) {
  await advanceWorld(host, { months: 1 });
  await new Promise(done => setImmediate(done));
  samples.push(snapshot());
  console.error(`[wool-supply] ${i + 1}/${months}`);
 }
 writeFileSync(output, JSON.stringify({ schemaVersion: 6, processingCounterPolicy: "Tracked retail goods and all fresh-food inputs; legacy missing history is not backfilled", initialProfile, foodLedgerKgPerUnit: WAIN_KG, goodMeasures: GOOD_MEASURES, sourceTreeSha256: createHash("sha256").update(JSON.stringify(sourceHashes)).digest("hex"), inputSha256: createHash("sha256").update(bytes).digest("hex"), seed: host.world.seed,
  settlementPattern: host.world.options.initialSettlementPattern, worldSettings: sim.worldSettings, sourceHashes, modelDensity, sheepAnnualWoolKg: SHEEP_ANNUAL_WOOL_KG, woolKgPerLot: WOOL_KG_PER_MARKET_LOT,
  notes: ["Footprint is sum(heads/model heads per hectare); it diagnoses simultaneous claims against the code's own ceilings, not an empirical carrying-capacity estimate.", "Headcounts include young cohorts. Monthly yield is a smoothed forecast; recorded ruralHarvest is actual market inflow.", "Stocks are market-only. Population is real residents; claims and occupied-cell examples are snapshots."], initial, samples }, null, 2) + "\n");
} finally { setTickStepObserver(null); setGoodFlowObserver(null); host.dispose(); }
