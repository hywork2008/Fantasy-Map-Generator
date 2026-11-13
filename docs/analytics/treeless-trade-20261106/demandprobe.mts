/**
 * Trade demand against household demand for Barrels, Beer and Wine at load (treeless-trade-20261106).
 * Read-only.
 *
 *   npx tsx docs/analytics/treeless-trade-20261106/demandprobe.mts <map.fmg>
 */
import { readFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { Markets } from "../../../src/extensions/economy/generators/markets-generator";
import {
  getMonthlyHouseholdContainerDemand,
  getMonthlyHouseholdDemand
} from "../../../src/extensions/economy/generators/foodProcessingLedger";

const [input] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
const m = Markets as unknown as Record<string, (...args: unknown[]) => any>;
const ctx = m.buildGlobalTradeContext.call(Markets);
const goods = getGoods().filter(g => ["Barrels", "Beer", "Wine", "Wood"].includes(g.name));
for (const g of goods)
  console.log(g.name, "consumer", ctx.consumerDemandFactors[g.i] ?? 0, "industrial", ctx.industrialDemandFactors[g.i] ?? 0);
const barrels = goods.find(g => g.name === "Barrels")!;
for (const market of getMarkets()) {
  const pop = ctx.populationByMarket[market.i] || 0;
  const cells = goods.map(g => {
    const trade = m.calculateMarketTradeDemand.call(Markets, g, market.i, pop, ctx.textilePopulationByMarket[market.i] || pop, ctx.consumerDemandFactors[g.i] || 0, ctx.industrialDemandFactors[g.i] || 0, ctx);
    const house = g === barrels ? getMonthlyHouseholdContainerDemand(market, barrels) : getMonthlyHouseholdDemand(market, g.name);
    return `${g.name} trade ${trade.toFixed(1)} house ${house.toFixed(1)}`;
  });
  console.log(`m${market.i} pop ${Math.round(pop)}  ${cells.join(" | ")}`);
}
process.exit(0);
