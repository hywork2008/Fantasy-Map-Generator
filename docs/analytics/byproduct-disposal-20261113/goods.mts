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
    townHouseholds: r2(getBurgMarketLedgers().reduce((sum, ledger) => sum + (ledger.householdWealth ?? 0), 0)),
    townTreasury: r2((pack.burgs ?? []).reduce((sum, burg) => sum + (burg && !burg.removed ? (burg.treasury ?? 0) : 0), 0)),
    stateTreasury: r2((pack.states ?? []).reduce((sum, state) => sum + (state && !state.removed ? (state.treasury ?? 0) : 0), 0))
  };
  return { stock, demand, money };
}
const snapshots = [];
for (let month = 1; month <= months; month++) {
  flows = {};
  await advanceWorld(host, { months: 1 });
  const rounded = Object.fromEntries(Object.entries(flows).map(([key, value]) => [key, r2(value)]));
  snapshots.push({ month, calendarMonth: getSimulationMonth(), ...snapshot(), flows: rounded });
  writeFileSync(output, JSON.stringify({ input, mode, snapshots }));
  console.log(`[goods] ${input} ${mode} month ${month}`);
}
process.exit(0);
