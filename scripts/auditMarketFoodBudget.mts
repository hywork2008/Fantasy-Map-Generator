/**
 * Urban staple food by Market (docs/plan/unsold-harvest-household-store.md §3.2): each year, per Market,
 * urban need and supply, the shortfall from an empty market (stockGap) and from empty wallets
 * (budgetGap), harvest bought, grain price and the urban households' wealth (monthly values summed).
 * Read-only. Usage: auditMarketFoodBudget.mts <archive.fmg> <output.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getMarkets } from "../src/extensions/economy/context/trade";
import { getHouseholdWealth } from "../src/extensions/economy/generators/burgMarketLedgers";
import { getStapleFoodGood } from "../src/extensions/economy/generators/foodProduction";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
const [input, output, length = "84"] = process.argv.slice(2);
const host = createNodeSimulationHost();
const years: any[] = [];
let flow: Record<number, Record<string, number>> = {};
const add = (m: number, k: string, v: number) => { const r = (flow[m] ??= {}); r[k] = (r[k] ?? 0) + (Number.isFinite(v) ? v : 0); };
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
for (let m = 1; m <= Number(length); m++) {
  await advanceWorld(host, { months: 1 });
  for (const market of getMarkets()) {
    const l = market.foodLedger; const c = l?.monthlyConsumption;
    if (c) { add(market.i, "urbanNeed", c.urbanNeed); add(market.i, "urbanSupplied", c.urbanSupplied); add(market.i, "stockGap", c.urbanStockGap); add(market.i, "budgetGap", c.urbanBudgetGap); add(market.i, "ruralNeed", c.ruralNeed); add(market.i, "ruralFromMarket", c.ruralFromMarket); }
    add(market.i, "bought", Math.max(0, l?.foodProduced ?? 0));
    const staple = getStapleFoodGood();
    add(market.i, "price", staple ? (market.goods[staple.i]?.price ?? 0) : 0);
    let wealth = 0;
    for (const b of getWorldContext().pack.burgs ?? []) if (b?.i && !b.removed && b.market === market.i) wealth += getHouseholdWealth(b.i);
    add(market.i, "urbanWealth", wealth);
    add(market.i, "unsold", Math.max(0, l?.unsoldHarvest ?? 0));
  }
  if (m % 12 === 0) {
    const w = getWorldContext(); const rate = w.populationRate || 1; const urb = w.urbanization ?? 1;
    const urban: Record<number, number> = {};
    for (const b of w.pack.burgs ?? []) if (b?.i && !b.removed && b.market) urban[b.market] = (urban[b.market] ?? 0) + (b.population ?? 0) * rate * urb;
    const stock: Record<number, number> = {};
    for (const market of getMarkets()) { const l = market.foodLedger; stock[market.i] = (l?.foodStockAge0 ?? 0) + (l?.foodStockAge1 ?? 0) + (l?.foodStockAge2 ?? 0) + (l?.foodStockAge3 ?? 0); }
    years.push({ year: host.simulation.currentYear, flow, urban, stock });
    flow = {};
  }
  await new Promise(d => setImmediate(d));
}
writeFileSync(output, JSON.stringify(years));
host.dispose();
