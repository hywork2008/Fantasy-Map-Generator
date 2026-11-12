/**
 * Salt price (docs/analytics/salt-price-20261112.md): each month, per market, the salt stock, price,
 * landed unit cost and the two price levels of priceSalt's reference (saltFinance.ts), with the
 * month's salt flows by direction and category. Map setup as in byproduct-export-20261112/goods.mts.
 *
 *   npx tsx docs/analytics/salt-price-20261112/salt.mts <map.fmg> <out.json> <months> <free|pay>
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
import { getMarketPriceLevel, getMoneyPriceLevelForMarket } from "../../../src/extensions/economy/generators/currencySufficiency";
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
const salt = goods.find(good => good.name === "Salt")!;
let flows: Record<string, Record<string, number>> = {};
setGoodFlowObserver(flow => {
  if (flow.goodId !== salt.i || flow.direction === "transfer" || !(flow.units > 0)) return;
  const key = `${flow.direction}|${flow.category}`;
  const byMarket = (flows[String(flow.marketId ?? -1)] ??= {});
  byMarket[key] = (byMarket[key] ?? 0) + flow.units;
});
const r3 = (value: number) => Math.round(value * 1000) / 1000;
const snapshots = [];
for (let month = 1; month <= months; month++) {
  flows = {};
  await advanceWorld(host, { months: 1 });
  const markets = getMarkets()
    .filter(Boolean)
    .map(market => {
      const row = market.goods[salt.i];
      return {
        i: market.i,
        stock: r3(row?.stock ?? 0),
        price: r3(row?.price ?? 0),
        landed: r3(market.saltLandedUnitCost ?? 0),
        level: r3(getMarketPriceLevel(market)),
        money: r3(getMoneyPriceLevelForMarket(market)),
        flows: Object.fromEntries(Object.entries(flows[String(market.i)] ?? {}).map(([k, v]) => [k, r3(v)]))
      };
    });
  snapshots.push({ month, calendarMonth: getSimulationMonth(), value: salt.value, markets });
  writeFileSync(output, JSON.stringify({ input, mode, snapshots }));
  console.log(`[salt] ${input} month ${month}`);
}
process.exit(0);
