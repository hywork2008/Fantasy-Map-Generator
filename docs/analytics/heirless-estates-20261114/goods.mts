/**
 * By-product pricing (docs/analytics/byproduct-pricing-20261111.md): goods.mts of household-goods-pay-20261111
 * with a stock-weighted price as the third figure of each stock entry. Sets
 * `householdGoodsPayment` to <mode>, then records every month: each good's market stock and mean
 * price, its physical flows by direction and category (recipe inputs by the good they make), the
 * household demand of the market household goods, and the money of the main holders. Barilla is
 * seeded as in barillaflow.mts so the runs match docs/analytics/barilla-20261108.md.
 *
 *   npx tsx docs/analytics/byproduct-pricing-20261111/goods.mts <map.fmg> <out.json> <months> <free|pay>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoodCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getSimulationMonth } from "../../../src/extensions/economy/economyContext";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getBurgMarketLedgers } from "../../../src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";
import { getMonthlyHouseholdDemand } from "../../../src/extensions/economy/generators/foodProcessingLedger";
import { personalCashTotal, readPersonalCash } from "../../../src/extensions/economy/generators/personalCash";
import { getSimulationCharacters as getCharacters } from "../../../src/extensions/characters/charactersContext";
import { computeLivingCost, resolveLifestyleTier, wealthReserveYears } from "../../../src/extensions/economy/generators/characterLivingCosts";
import { setMarketSettings } from "../../../src/simulation/marketSettings";
import { getGuildKnowledgeStocks } from "../../../src/extensions/economy/context/knowledge";
import { setHouseholdWealthFlowObserver } from "../../../src/extensions/economy/generators/burgMarketLedgers";

const [input, output, monthsArg, mode = "free"] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
setMarketSettings({
  householdGoodsPayment: mode === "pay" ? "pay" : "free",
  ...(process.env.FMG_WAX_KG ? { waxCandleKgPerPerson: Number(process.env.FMG_WAX_KG) } : {}),
  ...(process.env.FMG_GUILD_SURPLUS ? { guildSurplusUse: process.env.FMG_GUILD_SURPLUS as "spend" | "keep" } : {}),
  ...(process.env.FMG_WAX_SURPLUS ? { waxSurplus: process.env.FMG_WAX_SURPLUS as "tithe" | "keep" } : {}),
  ...(process.env.FMG_WAX_PRICING ? { beeswaxPricing: process.env.FMG_WAX_PRICING as "stockAndDemand" | "legacy" } : {}),
  ...(process.env.FMG_FUEL_CHOICE ? { fuelChoice: process.env.FMG_FUEL_CHOICE as "priceShare" | "cheapest" } : {})
});
const world = getWorldContext();
const { pack } = world;
const ruleHolds = (rule: string, cellId: number) => {
  const methods = Goods.getMethods(cellId);
  return Boolean(new Function(`{${Object.keys(methods).join(", ")}}`, `return ${rule}`)(methods));
};
const barilla = getGoods().find(good => good.name === "Barilla");
if (barilla?.distribution && barilla.chance) {
  const goodColumn = getGoodCellColumn();
  const random = Alea(`barilla-${world.seed}`);
  const cap = Math.ceil((200 * pack.cells.i.length) / 5000);
  let placed = 0;
  for (const cellId of pack.cells.i) {
    if (pack.cells.h[cellId] < 20 || goodColumn[cellId] === barilla.i) continue;
    if (!ruleHolds(barilla.distribution, cellId)) continue;
    if (goodColumn[cellId] || placed >= cap || random() * 100 > barilla.chance) continue;
    goodColumn[cellId] = barilla.i;
    placed++;
  }
}

const HOUSEHOLD_GOODS = ["Milk", "Cheese", "Grapes", "Raisins", "Wine", "Honey", "Apples", "Pears", "Cider", "Perry", "Mead", "Ale"];
const goods = getGoods();
const byId = new Map(goods.map(good => [good.i, good]));
let flows: Record<string, number> = {};
setGoodFlowObserver(flow => {
  const good = byId.get(flow.goodId);
  if (!good || flow.direction === "transfer" || !(flow.units > 0)) return;
  const related = flow.category === "recipeInput" && flow.relatedGoodId !== undefined ? byId.get(flow.relatedGoodId)?.name : "";
  const key = `${good.name}|${flow.direction}|${flow.category}${related ? `>${related}` : ""}`;
  flows[key] = (flows[key] ?? 0) + flow.units;
});
// Town household money by the function that moved it (FMG_WEALTH_CALLERS=1), summed per month.
let callers: Record<string, number> = {};
if (process.env.FMG_WEALTH_CALLERS) {
  setHouseholdWealthFlowObserver((_burgId, amount) => {
    const frame = (new Error().stack ?? "").split("\n")[3] ?? "";
    const name = frame.trim().replace(/^at /, "").replace(/ \(.*\/([^/]+?):\d+:\d+\)$/, " $1");
    const key = `${name}|${amount > 0 ? "in" : "out"}`;
    callers[key] = (callers[key] ?? 0) + amount;
  });
}
const r2 = (value: number) => Math.round(value * 100) / 100;
function snapshot() {
  const stock: Record<string, [number, number, number]> = {};
  for (const good of goods) {
    let units = 0;
    let priced = 0;
    let markets = 0;
    let weighted = 0;
    for (const market of getMarkets()) {
      const row = market?.goods?.[good.i];
      if (!row) continue;
      units += Math.max(0, row.stock ?? 0);
      priced += (row.price ?? 0) / (good.value || 1);
      weighted += (Math.max(0, row.stock ?? 0) * (row.price ?? 0)) / (good.value || 1);
      markets++;
    }
    if (units > 0 || markets) stock[good.name] = [r2(units), r2(markets ? priced / markets : 0), r2(units > 0 ? weighted / units : 0)];
  }
  const demand: Record<string, number> = {};
  for (const name of HOUSEHOLD_GOODS)
    demand[name] = r2(getMarkets().reduce((sum, market) => sum + (market ? getMonthlyHouseholdDemand(market, name) : 0), 0));
  const money = {
    rural: r2(getMarkets().reduce((sum, market) => sum + (market?.foodLedger?.ruralHouseholdWealth ?? 0), 0)),
    marketCash: r2(getMarkets().reduce((sum, market) => sum + (market?.marketTreasury?.balance ?? 0), 0)),
    guilds: r2(getGuildKnowledgeStocks().reduce((sum, guild) => sum + (guild.treasury ?? 0), 0)),
    townHouseholds: r2(getBurgMarketLedgers().reduce((sum, ledger) => sum + (ledger.householdWealth ?? 0), 0)),
    townTreasury: r2((pack.burgs ?? []).reduce((sum, burg) => sum + (burg && !burg.removed ? (burg.treasury ?? 0) : 0), 0)),
    characters: r2(readPersonalCash() ? personalCashTotal() : getCharacters().reduce((sum, ch) => sum + (ch.wealth ?? 0), 0)),
    stateTreasury: r2((pack.states ?? []).reduce((sum, state) => sum + (state && !state.removed ? (state.treasury ?? 0) : 0), 0))
  };
  // Beeswax by market: [market, stock, price/value, port, candles stock] (docs/plan/wax-pricing.md).
  const wax = goods.find(good => good.name === "Beeswax");
  const candles = goods.find(good => good.name === "Candles");
  const ports = new Set((pack.burgs ?? []).filter(burg => burg?.i && !burg.removed && burg.port).map(burg => burg.market));
  const waxMarkets = wax
    ? getMarkets()
        .filter(market => market?.goods?.[wax.i])
        .map(market => [
          market.i,
          r2(Math.max(0, market.goods[wax.i].stock ?? 0)),
          r2((market.goods[wax.i].price ?? 0) / wax.value),
          ports.has(market.i) ? 1 : 0,
          r2(candles ? Math.max(0, market.goods[candles.i]?.stock ?? 0) : 0)
        ])
    : [];
  return { stock, demand, money, waxMarkets, cash: cashBreakdown() };
}
// Character wealth by lifestyle tier (docs/analytics/heirless-estates-20261114.md): people, wealth, the
// reserve the tier keeps before it spends a surplus (living cost x (1 + 12 x reserve years)), the wealth
// above it, and the wealth of the dead.
function cashBreakdown() {
  const tiers: Record<string, { people: number; wealth: number; reserve: number; overReserve: number }> = {};
  let dead = 0;
  let deadWealth = 0;
  for (const character of getCharacters()) {
    if (!character) continue;
    const wealth = character.wealth ?? 0;
    if (character.dead) {
      dead++;
      deadWealth += wealth;
      continue;
    }
    const tier = resolveLifestyleTier(character);
    const cost = computeLivingCost(character);
    const reserve = cost * (1 + 12 * wealthReserveYears(tier));
    const row = (tiers[tier] ??= { people: 0, wealth: 0, reserve: 0, overReserve: 0 });
    row.people++;
    row.wealth += wealth;
    row.reserve += reserve;
    row.overReserve += Math.max(0, wealth - reserve);
  }
  const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)]));
  return { tiers: Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, round(v)])), dead, deadWealth: r2(deadWealth) };
}
const snapshots = [];
for (let month = 1; month <= months; month++) {
  flows = {};
  callers = {};
  await advanceWorld(host, { months: 1 });
  const rounded = Object.fromEntries(Object.entries(flows).map(([key, value]) => [key, r2(value)]));
  snapshots.push({ month, calendarMonth: getSimulationMonth(), ...snapshot(), flows: rounded, callers });
  writeFileSync(output, JSON.stringify({ input, mode, snapshots }));
  console.log(`[goods] ${input} ${mode} month ${month}`);
}
process.exit(0);
