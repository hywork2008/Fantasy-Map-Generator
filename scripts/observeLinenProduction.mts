#!/usr/bin/env tsx
/** Same-input T9 comparison with textile candidate diagnostics. Records successful manufacture separately from market intake.
 * Usage: node --import tsx scripts/observeLinenProduction.mts input.fmg output.json label [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../src/simulation/adapters/node";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { GOOD_MEASURES } from "../src/extensions/economy/generators/goodMeasureCatalog";
import { setGoodFlowObserver } from "../src/extensions/economy/generators/goodsBalanceLedger";
import { Markets } from "../src/extensions/economy/generators/markets-generator";
import { getEconomyCalibrationState } from "../src/extensions/economy/state/economyCalibrationStore";
import { getMarketTextileDemandProfile } from "../src/extensions/economy/generators/textileDemand";
import { ProductionModule } from "../src/extensions/economy/generators/production-generator";
import type { MfgRecord, ProductionRecord } from "../src/extensions/economy/generators/productionRecordTypes";

const [input, output, label, count = "36"] = process.argv.slice(2);
const months = Number(count);
if (!input || !output || !label || !Number.isSafeInteger(months) || months < 1) throw new Error("Invalid arguments");
const names = new Set(["Flax", "Wool", "Hemp", "Cotton", "Cloth", "Linen", "Garments", "Linen Garments", "Fine Wool Cloth", "Fine Wool Garments"]);
const paths = ["scripts/observeLinenProduction.mts", "src/extensions/economy/generators/goods-generator.ts", "src/extensions/economy/generators/production-generator.ts", "src/extensions/economy/generators/markets-generator.ts", "src/extensions/economy/generators/goodMeasureCatalog.ts", "src/extensions/economy/generators/craftDemandCalibration.ts", "src/extensions/economy/generators/textileRecipeContracts.ts", "src/extensions/economy/generators/textileDemand.ts", "src/extensions/economy/generators/guildKnowledgeTypes.ts", "src/extensions/economy/generators/occupationalCalibration.ts"];
const sourceHashes = Object.fromEntries(paths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(bytes));
await host.prepare();
if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
const sim = host.simulation as { worldSettings?: Record<string, string> };
sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
const goods = getGoods();
const byId = new Map(goods.map(good => [good.i, good]));
const contract = goods.filter(good => names.has(good.name)).map(good => structuredClone(good));
type Amount = { units: number; value: number };
let flows: Record<string, Amount> = {};
let manufactured: Record<string, { units: number; labor: number; inputs: Record<string, number>; byproducts: Record<string, number> }> = {};
// Wrap the execution method only in this observer process, preserving its result and all records.
const prototype = ProductionModule.prototype as unknown as {
 executeManufacture: (state: {records: ProductionRecord[]}, ...args: unknown[]) => {yieldLots: number; laborUsed: number};
};
let diagnostics: Record<string, { calls: number; examples: unknown[] }> = {};
const traceNames = new Set(["Linen", "Garments", "Linen Garments"]);
const trace = (key: string, example: unknown) => {
 const row = diagnostics[key] ??= { calls: 0, examples: [] };
 row.calls++;
 if (row.examples.length < 3) row.examples.push(example);
};
// Diagnostic wrappers return the original results unchanged; they do not alter candidate ordering.
const peek = (market: any, goodId: number) => {
 const row = market.goods[goodId];
 const price = row?.price ?? byId.get(goodId)?.value ?? 0;
 return { stock: row?.stock ?? 0, buyPrice: Markets.customerBuyPrice(price, market.centerBurgId, goodId),
  sellPrice: Markets.customerSellPrice(price, market.centerBurgId, goodId) };
};
const hooks = ProductionModule.prototype as any;
const immediateOriginal = hooks.buildImmediateManufactureCandidate;
hooks.buildImmediateManufactureCandidate = function(state: any, recipe: any, demandEffect: any, units: number, ...rest: any[]) {
 const result = immediateOriginal.call(this, state, recipe, demandEffect, units, ...rest);
 if (traceNames.has(recipe.good.name)) {
  const inputs = recipe.ingredients.map((input: any) => {
   const quote = peek(state.market, input.goodId);
   const inventory = state.inventory[input.goodId] || 0;
   return { name: byId.get(input.goodId)?.name, amount: input.amount, market: quote.stock, inventory, buyPrice: quote.buyPrice };
  });
  const missing = inputs.some((input: any) => input.market + input.inventory < input.amount * units - 0.001);
  const status = result ? "accepted" : missing ? "insufficientInputs" : "marginOrYield";
  const route = inputs.map((input: any) => input.name).join("+");
  trace(`${recipe.good.name}:${route}:${status}`, { burgId: state.burg.i, marketId: state.market.i, units,
   sellPrice: peek(state.market, recipe.good.i).sellPrice, inputs, score: result?.candidate.score,
   householdDemand: getMarketTextileDemandProfile(state.market.i).monthlyDemand });
 }
 return result;
};
const planOriginal = hooks.planGoodAction;
hooks.planGoodAction = function(index: any, state: any, good: any, target: number, step: number, workers: number, ...rest: any[]) {
 const result = planOriginal.call(this, index, state, good, target, step, workers, ...rest);
 if (traceNames.has(good.name)) trace(`${good.name}:plan:${result ? "feasible" : "rejected"}`, {
  burgId: state.burg.i, target, step, workers, action: result?.action.good.name,
  gain: result?.normalizedGain, workersNeeded: result?.workersNeeded,
  remainingCalibratedLots: state.remainingCalibratedLots.get(good.i),
  minWorkers: index.minWorkersByGood[good.i]
 });
 return result;
};
const decisionOriginal = hooks.makeProductionDecision;
hooks.makeProductionDecision = function(...args: any[]) {
 const result = decisionOriginal.apply(this, args);
 if (result && traceNames.has(result.action.good.name)) trace(`${result.action.good.name}:selected`, {
  burgId: args[1].burg.i, goal: byId.get(result.goalGoodId)?.name, maxYield: result.action.maxYield,
  fraction: args[6], treasury: args[1].burg.treasury
 });
 return result;
};
const original = prototype.executeManufacture;
prototype.executeManufacture = function(state, ...args) {
 const start = state.records.length;
 const result = original.call(this, state, ...args);
 const action = (args[1] as any)?.action;
 if (action && traceNames.has(action.good.name)) trace(`${action.good.name}:execute:${result.yieldLots > 0 ? "success" : "failed"}`, {
  laborBudget: args[2], ...result, maxYield: action.maxYield
 });
 for (const record of state.records.slice(start)) {
  if (!("recipe" in record)) continue;
  const r = record as MfgRecord;
  const good = byId.get(r.goodId);
  if (!good || !names.has(good.name)) continue;
  const row = manufactured[good.name] ??= { units: 0, labor: 0, inputs: {}, byproducts: {} };
  row.units += r.units;
  row.labor += result.laborUsed;
  for (const entry of r.recipe) { const name = byId.get(entry.goodId)!.name; row.inputs[name] = (row.inputs[name] ?? 0) + entry.units; }
  for (const entry of r.byproducts ?? []) { const name = byId.get(entry.goodId)!.name; row.byproducts[name] = (row.byproducts[name] ?? 0) + entry.units; }
 }
 return result;
};
setGoodFlowObserver(flow => {
 const good = byId.get(flow.goodId);
 if (!good || !names.has(good.name) || flow.direction === "transfer") return;
 const key = `${good.name}:${flow.direction}:${flow.category}`;
 const row = flows[key] ??= { units: 0, value: 0 };
 const price = getMarkets().find(market => market.i === flow.marketId)?.goods[good.i]?.price ?? good.value;
 row.units += flow.units;
 row.value += flow.units * price;
});
function snapshot() {
 const stock = Object.fromEntries(goods.filter(good => names.has(good.name)).map(good => {
  const rows = getMarkets().map(market => market.goods[good.i]).filter(Boolean);
  const units = rows.reduce((sum, row) => sum + row.stock, 0);
  const value = rows.reduce((sum, row) => sum + row.stock * row.price, 0);
  return [good.name, {units, value, kg: units * GOOD_MEASURES[good.name].kg, liters: units * GOOD_MEASURES[good.name].liters,
   meanPrice: rows.length ? rows.reduce((sum, row) => sum + row.price, 0) / rows.length : null}];
 }));
 const result = {date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay], stock, flows, manufactured, diagnostics};
 flows = {}; manufactured = {}; diagnostics = {};
 return result;
}
const initial = snapshot();
const samples = [];
try {
 for(let month = 0; month < months; month++) {
  host.advance({months: 1});
  await new Promise(done => setImmediate(done));
  samples.push(snapshot());
  console.error(`[textiles:${label}] ${month + 1}/${months}`);
 }

 writeFileSync(output, JSON.stringify({label, inputSha256: createHash("sha256").update(bytes).digest("hex"), seed: host.world.seed,
 populationRate: host.world.populationRate, settlementPattern: host.world.options.initialSettlementPattern,
 sourceHashes, worldSettings: sim.worldSettings, applyCalibration: getEconomyCalibrationState().applyCalibration,
 notes: ["Market flow values are stock valuations, not cash payments.", "Manufacture is intercepted at successful executeManufacture calls, including inventory inputs; quantities have the precision of production records.", "Stocks cover markets only; private and in-transit inventory is excluded."], contract, initial, samples}, null, 2) + "\n");
} finally { prototype.executeManufacture = original; hooks.buildImmediateManufactureCandidate = immediateOriginal; hooks.planGoodAction = planOriginal; hooks.makeProductionDecision = decisionOriginal; setGoodFlowObserver(null); host.dispose(); }
