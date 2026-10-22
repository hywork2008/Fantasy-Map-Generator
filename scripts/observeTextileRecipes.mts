#!/usr/bin/env tsx
/** Same-input T8 comparison. Records successful manufacture separately from market intake.
 * Usage: node --import tsx scripts/observeTextileRecipes.mts input.fmg output.json label [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../src/simulation/adapters/node";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { GOOD_MEASURES } from "../src/extensions/economy/generators/goodMeasureCatalog";
import { setGoodFlowObserver } from "../src/extensions/economy/generators/goodsBalanceLedger";
import { ProductionModule } from "../src/extensions/economy/generators/production-generator";
import type { MfgRecord, ProductionRecord } from "../src/extensions/economy/generators/productionRecordTypes";

const [input, output, label, count = "36"] = process.argv.slice(2);
const months = Number(count);
if (!input || !output || !label || !Number.isSafeInteger(months) || months < 1) throw new Error("Invalid arguments");
const names = new Set(["Wool", "Hemp", "Cotton", "Cloth", "Linen", "Garments", "Fine Wool Cloth", "Fine Wool Garments"]);
const paths = ["scripts/observeTextileRecipes.mts", "src/extensions/economy/generators/goods-generator.ts", "src/extensions/economy/generators/production-generator.ts", "src/extensions/economy/generators/markets-generator.ts", "src/extensions/economy/generators/goodMeasureCatalog.ts", "src/extensions/economy/generators/craftDemandCalibration.ts", "src/extensions/economy/generators/textileRecipeContracts.ts"];
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
const original = prototype.executeManufacture;
prototype.executeManufacture = function(state, ...args) {
 const start = state.records.length;
 const result = original.call(this, state, ...args);
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
 const result = {date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay], stock, flows, manufactured};
 flows = {}; manufactured = {};
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
 sourceHashes,
 notes: ["Market flow values are stock valuations, not cash payments.", "Manufacture is intercepted at successful executeManufacture calls, including inventory inputs; quantities have the precision of production records.", "Stocks cover markets only; private and in-transit inventory is excluded."], contract, initial, samples}, null, 2) + "\n");
} finally { prototype.executeManufacture = original; setGoodFlowObserver(null); host.dispose(); }
