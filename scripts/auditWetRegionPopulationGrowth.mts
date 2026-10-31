/**
 * Why population grows less after the wet-region pastoral change (docs/plan/wet-region-pastoral-economy.md
 * §3.5): each year, the urban carrying capacity against urban people and the hinterland grain surplus
 * that feeds it (urbanFoodCapacity.ts), the rural subsistence capacity against rural people, food
 * stress, household grain stores and cash, and what the herds cost: fodder bought with rural
 * household cash and feed left unmet. Run on the same fixed input before and after. Read-only.
 * Usage: auditWetRegionPopulationGrowth.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  getCropLaborCoverage,
  getCultivableArea,
  getCultivatedArea,
  getRuralFoodCapacity,
  getRuralHouseholdFoodStock
} from "../src/extensions/economy/context/agriculture";
import { getMarketCellColumn, getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getMarkets } from "../src/extensions/economy/context/trade";
import { GROSS_FOOD_NEED } from "../src/extensions/economy/generators/foodConstants";
import { setGoodFlowObserver } from "../src/extensions/economy/generators/goodsBalanceLedger";
import { getRuralGrainDietShare } from "../src/extensions/economy/generators/ruralDiet";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "./lib/conflictAutonomyFromEnv.mts";

const [input, output, length = "144"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1)
  throw new Error("Usage: auditWetRegionPopulationGrowth.mts <archive.fmg> <output.json> [months]");

const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const years: unknown[] = [];
type Flow = Record<string, number>;
let flow: Flow = {};
const add = (row: Flow, key: string, v: number) => (row[key] = (row[key] ?? 0) + (Number.isFinite(v) ? v : 0));

function sampleMonth() {
  for (const market of getMarkets()) {
    const c = market.foodLedger?.monthlyConsumption;
    if (c) {
      add(flow, "ruralNeed", c.ruralNeed);
      add(flow, "ruralSupplied", c.ruralSupplied);
      add(flow, "ruralFromMarket", c.ruralFromMarket);
      add(flow, "ruralPaid", c.ruralPaid);
      add(flow, "urbanNeed", c.urbanNeed);
      add(flow, "urbanSupplied", c.urbanSupplied);
      add(flow, "urbanBudgetGap", c.urbanBudgetGap);
      add(flow, "urbanStockGap", c.urbanStockGap);
    }
    add(flow, "unsoldHarvest", Math.max(0, market.foodLedger?.unsoldHarvest ?? 0));
    add(flow, "marketBought", Math.max(0, market.foodLedger?.foodProduced ?? 0));
  }
  for (const row of Object.values(getOrCreateLivestockFeedTable() ?? {})) {
    add(flow, "feedRequiredKg", row.requiredKg ?? 0);
    add(flow, "feedUnmetKg", row.unmetKg ?? 0);
    add(flow, "feedPastureKg", row.pastureConsumedKg ?? 0);
    add(flow, "feedHayKg", row.hayConsumedKg ?? 0);
    add(flow, "feedResidueKg", row.cropResidueFeedKg ?? 0);
  }
}

function sampleYear(month: number) {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const rate = world.populationRate || 1;
  const urbanization = Math.max(1e-6, world.urbanization ?? 1);
  const capacity = getRuralFoodCapacity();
  const cultivable = getCultivableArea();
  const cultivated = getCultivatedArea();
  const coverage = getCropLaborCoverage();
  const stores = getRuralHouseholdFoodStock();
  const marketOf = getMarketCellColumn();
  const state: Flow = {};
  // urbanFoodCapacity.ts: hinterland surplus = worked field capacity - rural grain eaters, per market.
  const surplusByMarket = new Map<number, number>();
  for (const cell of cells.i) {
    if (cells.h[cell] < 20) continue;
    const pop = Math.max(0, cells.pop[cell] ?? 0);
    const land = cultivable[cell] > 0 ? Math.min(1, Math.max(0, (cultivated[cell] ?? 0) / cultivable[cell])) : 1;
    const worked = Math.max(0, capacity[cell] ?? 0) * land * Math.min(1, Math.max(0, coverage[cell] ?? 1));
    const eaters = pop * getRuralGrainDietShare(cells, cell, capacity);
    surplusByMarket.set(marketOf[cell], (surplusByMarket.get(marketOf[cell]) ?? 0) + worked - eaters);
    add(state, "ruralPeople", pop * rate);
    add(state, "ruralGrainEaters", eaters * rate);
    add(state, "ruralSubsistenceCapacityPeople", (cells.subsistenceCapacity?.[cell] ?? 0) * rate);
    add(state, "workedFieldCapacityPeople", worked * rate);
    add(state, "householdGrainStorePersonYears", (stores[cell] ?? 0) / GROSS_FOOD_NEED);
  }
  for (const surplus of surplusByMarket.values())
    add(state, "hinterlandSurplusUrbanPeople", (Math.max(0, surplus) / urbanization) * rate * urbanization);
  for (const burg of world.pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    add(state, "urbanPeople", Math.max(0, burg.population ?? 0) * rate * urbanization);
    add(state, "urbanCapacityPeople", Math.max(0, burg.demographics?.capacity ?? 0) * rate * urbanization);
    add(state, "urbanSeedCapacityPeople", Math.max(0, burg.demographics?.seedCapacity ?? 0) * rate * urbanization);
  }
  for (const market of getMarkets()) {
    const ledger = market.foodLedger;
    add(state, "ruralHouseholdWealth", ledger?.ruralHouseholdWealth ?? 0);
    if ((ledger?.ruralFoodStressQuarters ?? 0) > 0) add(state, "marketsRuralStress", 1);
    if ((ledger?.urbanFoodStressQuarters ?? 0) > 0) add(state, "marketsUrbanStress", 1);
    add(state, "marketGrainStock", (ledger?.foodStockAge0 ?? 0) + (ledger?.foodStockAge1 ?? 0) + (ledger?.foodStockAge2 ?? 0) + (ledger?.foodStockAge3 ?? 0));
  }
  years.push({ month, date: [host.simulation.currentYear, host.simulation.currentMonth], state, lastTwelveMonths: flow });
  flow = {};
}

try {
  setGoodFlowObserver(f => {
    if (f.category === "livestockFeed" && f.direction === "sink") add(flow, "fodderBoughtLots", f.units);
  });
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  applyConflictAutonomyFromEnv();
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    sampleMonth();
    if (m % 12 === 0 || m === months) sampleYear(m);
    console.error(`[wet-population] ${m}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        notes: [
          "People are real people (population points x populationRate; urban also x urbanization).",
          "hinterlandSurplusUrbanPeople: per market, max(0, worked field capacity - rural grain eaters), as in urbanFoodCapacity.ts, in people.",
          "lastTwelveMonths: monthly Food Ledger settlement (food-ledger units), livestock feed ledgers (kg DM) and Fodder lots bought for herds, summed since the previous sample."
        ],
        years
      },
      null,
      1
    )}\n`
  );
} finally {
  setGoodFlowObserver(null);
  host.dispose();
}
