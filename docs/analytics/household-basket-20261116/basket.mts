/**
 * Household basket probe (docs/plan/household-basket-scale.md §4 steps 1–2): gdp.mts of wage-cost-20261116 plus
 * every consumption-side flow (direction not "source", any category but intermediates) by category and good, in
 * units and value at its market's price, each month.
 *
 * GDP and wage-multiple probe (docs/plan/per-capita-income-scale.md §5.1, §6 steps 3–4). Every month:
 * - goods value added: every production flow (source categories) less every intermediate use (recipe input,
 *   smelting, livestock feed), each at its market's current price;
 * - staple food: what the food ledger supplied to rural, town and lodger mouths at the local retail price
 *   (rural food from the household's own store at the farmgate share);
 * - services: money paid into town households and characters by the state and nobility steps;
 * plus money holders, and every 6 months the price medians and craft output by good.
 *
 *   FMG_SETTINGS='{"wageSubsistenceMultiple":8}' npx tsx docs/analytics/wage-cost-20261116/gdp.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { createMoneyFlowRecorder } from "../../../scripts/lib/observeViews.mts";
import { setTickStepObserver } from "../../../src/generators/tickProfiler";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";
import { getStapleFoodGood, FARMGATE_PRICE_SHARE } from "../../../src/extensions/economy/generators/foodProduction";
import { setMarketSettings } from "../../../src/simulation/marketSettings";

const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 36);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const settings = JSON.parse(process.env.FMG_SETTINGS ?? "{}");
setMarketSettings(settings);
const world = getWorldContext();
const { pack } = world;
const SOURCES = new Set(["ruralHarvest", "ruralCraft", "clearanceSupply", "mineSupply", "smelterSupply", "burgCraft", "forestGlass", "hearthAsh", "vesselSalvage"]);
const INTERMEDIATE = new Set(["recipeInput", "smelting", "livestockFeed"]);
const marketById = new Map(getMarkets().filter(Boolean).map(m => [m.i, m]));
const goodById = new Map(getGoods().map(g => [g.i, g]));
const priceOf = (goodId: number, marketId?: number) => {
  const m = marketId != null ? marketById.get(marketId) : undefined;
  const p = m?.goods?.[goodId]?.price;
  return p && p > 0 ? p : goodById.get(goodId)?.value ?? 0;
};
let produced = 0, used = 0;
let craft: Record<string, number> = {};
let byGood: Record<string, number> = {};
let used2: Record<string, [number, number]> = {};
setGoodFlowObserver(flow => {
  if (!(flow.units > 0)) return;
  if (flow.direction === "source" && SOURCES.has(flow.category)) {
    const value = flow.units * priceOf(flow.goodId, flow.marketId);
    produced += value;
    const key = `${flow.category}:${goodById.get(flow.goodId)?.name ?? flow.goodId}`;
    byGood[key] = (byGood[key] ?? 0) + value;
    if (flow.category === "burgCraft") {
      const n = goodById.get(flow.goodId)?.name ?? String(flow.goodId);
      craft[n] = (craft[n] ?? 0) + flow.units;
    }
  }
  if (flow.direction !== "source" && !INTERMEDIATE.has(flow.category)) {
    const key = `${flow.category}:${goodById.get(flow.goodId)?.name ?? flow.goodId}`;
    const row = (used2[key] ??= [0, 0]);
    row[0] += flow.units;
    row[1] += flow.units * priceOf(flow.goodId, flow.marketId);
  }
  if (flow.direction !== "source" && INTERMEDIATE.has(flow.category)) {
    const value = flow.units * priceOf(flow.goodId, flow.marketId);
    used += value;
    const key = `${flow.category}:${goodById.get(flow.goodId)?.name ?? flow.goodId}`;
    byGood[key] = (byGood[key] ?? 0) - value;
  }
});
const recorder = createMoneyFlowRecorder(() => host.world);
setTickStepObserver(recorder.observer);
const staple = getStapleFoodGood()!;
function stapleValue() {
  let v = 0;
  for (const m of marketById.values()) {
    const c = m.foodLedger?.monthlyConsumption;
    if (!c) continue;
    const p = priceOf(staple.i, m.i);
    v += (c.ruralFromHousehold * FARMGATE_PRICE_SHARE + (c.ruralSupplied - c.ruralFromHousehold) + c.urbanSupplied + c.lodgerSupplied) * p;
  }
  return v;
}
/** Sums every numeric field of a per-market ledger (one level of nesting) across markets, valued where a good id is known. */
function ledgers() {
  const fp: Record<string, Record<string, number>> = {};
  const tx: Record<string, Record<string, number>> = {};
  const add = (into: Record<string, Record<string, number>>, key: string, row: Record<string, unknown>, price: number) => {
    const out = (into[key] ??= {});
    for (const [k, v] of Object.entries(row)) if (typeof v === "number" && Number.isFinite(v)) out[k] = (out[k] ?? 0) + v;
    out.valueOfHouseholdUse = (out.valueOfHouseholdUse ?? 0) + (((row.householdConsumption as number) ?? 0) + ((row.localHouseholdConsumptionThisCycle as number) ?? 0)) * price;
  };
  const byName = new Map(getGoods().map(g => [g.name, g.i]));
  for (const m of marketById.values()) {
    for (const [name, row] of Object.entries(m.foodProcessingLedger ?? {})) if (row) add(fp, name, row as never, priceOf(byName.get(name) ?? -1, m.i));
    if (m.textileLedger) add(tx, "Garments", m.textileLedger as never, priceOf(byName.get("Garments") ?? -1, m.i));
    if (m.blanketLedger) add(tx, "Wool Blankets", m.blanketLedger as never, priceOf(byName.get("Wool Blankets") ?? -1, m.i));
  }
  return { fp, tx };
}
function heads() {
  let rural = 0, urban = 0;
  for (const i of pack.cells.i) rural += pack.cells.pop[i] ?? 0;
  for (const b of pack.burgs ?? []) if (b?.i && !b.removed) urban += b.population ?? 0;
  return (rural + urban) * ((globalThis as any).populationRate ?? 1000);
}
function medians() {
  const out: Record<string, number> = {};
  const ms = [...marketById.values()];
  for (const g of getGoods()) {
    const ps = ms.map(m => m.goods?.[g.i]?.price ?? 0).filter(p => p > 0).sort((a, b) => a - b);
    if (ps.length) out[g.name] = ps[Math.floor(ps.length / 2)];
  }
  return out;
}
const snaps: unknown[] = [];
for (let month = 1; month <= months; month++) {
  produced = 0; used = 0; byGood = {}; used2 = {};
  await advanceWorld(host, { months: 1 });
  const flows = recorder.flush();
  let services = 0, hhIn = 0;
  for (const f of flows as Record<string, number | string>[]) {
    const step = String(f.step);
    const inflow = Math.max(0, Number(f.urbanHouseholds ?? 0)) + Math.max(0, Number(f.characters ?? 0));
    if (step.startsWith("taxes:") || step.startsWith("nobility:")) services += inflow;
    hhIn += Math.max(0, Number(f.urbanHouseholds ?? 0)) + Math.max(0, Number(f.ruralHouseholds ?? 0));
  }
  const snap: Record<string, unknown> = { month, goodsVA: produced - used, produced, used, staple: stapleValue(), services, hhIn, totals: recorder.totals(), heads: heads(), stapleMedianPrice: medians()[staple.name] };
  snap.ledgers = ledgers();
  // Where unmet household textiles stop (docs/plan/textile-basket-scale.md §3.1): the ledger's gap partition, summed.
  const gaps: Record<string, Record<string, number>> = {};
  const gapKeys = ["need", "supplied", "marketSupplied", "marketPaid", "remainingBudget", "unmet", "priorityGap", "budgetGap", "stockGap", "allocationOrRoundingGap", "noPricedRouteGap"];
  const stockNames = ["Garments", "Wool Garments", "Linen Garments", "Wool Blankets", "Cloth", "Wool Cloth", "Linen"];
  const stocks: Record<string, number> = {};
  const goodIdByName = new Map(getGoods().map(g => [g.name, g.i]));
  for (const m of marketById.values()) {
    for (const [label, ledger] of [["Garments", m.textileLedger], ["Wool Blankets", m.blanketLedger]] as const) {
      for (const buyer of (ledger as any)?.settlementDiagnostics?.buyers ?? []) {
        const key = `${label}:${buyer.rural ? "rural" : "urban"}`;
        const row = (gaps[key] ??= {});
        for (const k of gapKeys) row[k] = (row[k] ?? 0) + (Number(buyer[k]) || 0);
      }
    }
    for (const name of stockNames) {
      const id = goodIdByName.get(name);
      if (id !== undefined) stocks[name] = (stocks[name] ?? 0) + Math.max(0, m.goods?.[id]?.stock ?? 0);
    }
  }
  snap.textileGaps = gaps;
  snap.textileStocks = stocks;
  snap.sinks = Object.fromEntries(Object.entries(used2).filter(([, v]) => v[1] > 10).map(([k, v]) => [k, [Math.round(v[0]), Math.round(v[1])]]));
  snap.byGood = Object.fromEntries(Object.entries(byGood).filter(([, v]) => Math.abs(v) > 100).map(([k, v]) => [k, Math.round(v)]));
  if (month % 12 === 0) {
    const cheese = getGoods().find(g => g.name === "Cheese");
    snap.dairyMarkets = [...marketById.values()].map(m => ({ i: m.i, tradition: m.dairyTraditionLitersPerHead, cheesePrice: cheese ? m.goods?.[cheese.i]?.price : undefined, cheeseStock: cheese ? m.goods?.[cheese.i]?.stock : undefined }));
  }
  if (month % 6 === 0) { snap.prices = medians(); snap.craft = craft; craft = {}; }
  snaps.push(snap);
  console.log(`month ${month}`);
}
setTickStepObserver(null);
writeFileSync(output, JSON.stringify({ input, settings, snaps }));
