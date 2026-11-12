/**
 * Rural goods budget (docs/analytics/rural-goods-budget-20261112.md): each month, per market, the farm
 * families' town budget (getRuralTownSpend), their purse, and what their share of the per-head
 * floors of Boots, Leather Goods and Candles would cost at the market price, with the paid units.
 * Map setup as in candle-demand-20261111/goods.mts.
 *
 *   npx tsx docs/analytics/rural-goods-budget-20261112/budget.mts <map.fmg> <out.json> <months> <free|pay>
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
import { getRuralTownSpend } from "../../../src/extensions/economy/generators/householdWealth";
import { getMarketRuralPopulation } from "../../../src/extensions/economy/generators/marketPopulation";
import { getCountrysideAnnualLotsPerPerson } from "../../../src/extensions/economy/generators/footwearDemand";
import { setMarketSettings } from "../../../src/simulation/marketSettings";

const [input, output, monthsArg, mode = "free"] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
setMarketSettings({ householdGoodsPayment: mode === "pay" ? "pay" : "free" });
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

const goods = getGoods();
const byId = new Map(goods.map(good => [good.i, good]));
const NAMES = ["Boots", "Leather Goods", "Candles"];
let bought: Record<string, number> = {};
setGoodFlowObserver(flow => {
  const good = byId.get(flow.goodId);
  if (!good || !NAMES.includes(good.name) || flow.direction !== "sink" || flow.category !== "burgDemand") return;
  bought[good.name] = (bought[good.name] ?? 0) + flow.units;
});
const r2 = (value: number) => Math.round(value * 100) / 100;
const snapshots = [];
for (let month = 1; month <= months; month++) {
  bought = {};
  await advanceWorld(host, { months: 1 });
  const markets = [];
  for (const market of getMarkets()) {
    if (!market?.foodLedger) continue;
    const people = getMarketRuralPopulation(world, market.i);
    const cost: Record<string, number> = {};
    for (const name of NAMES) {
      const good = goods.find(entry => entry.name === name);
      const lots = getCountrysideAnnualLotsPerPerson(name) ?? 0;
      cost[name] = good ? r2(((people * lots) / 12) * (market.goods[good.i]?.price ?? good.value)) : 0;
    }
    markets.push({
      i: market.i,
      people: Math.round(people),
      purse: r2(market.foodLedger.ruralHouseholdWealth ?? 0),
      budget: r2(getRuralTownSpend(market)),
      cost
    });
  }
  snapshots.push({ month, calendarMonth: getSimulationMonth(), bought, markets });
  writeFileSync(output, JSON.stringify({ input, mode, snapshots }));
  console.log(`[budget] ${input} month ${month}`);
}
process.exit(0);
