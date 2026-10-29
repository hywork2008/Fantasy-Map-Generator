/**
 * Where a Market's goods go and what they bring in (docs/plan/unsold-harvest-household-store.md §4):
 * per Market and year, each Good's recorded flows by category (production, export, local use,
 * spoilage) in units and at the Market's current price, and the Market treasury balance. Run to
 * compare Markets whose towns run out of money with those that gather it. Read-only apart from the
 * goods-flow observer. Usage: auditMarketProductSales.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "../src/extensions/economy/generators/goodsBalanceLedger";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "84"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 12)
  throw new Error("Usage: auditMarketProductSales.mts <archive.fmg> <output.json> [months>=12]");

const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const years: unknown[] = [];
/** market -> good name -> "direction category" -> [units, value] */
let flows: Record<number, Record<string, Record<string, [number, number]>>> = {};

try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  const names = new Map(getGoods().map(good => [good.i, good.name]));
  const markets = new Map(getMarkets().map(market => [market.i, market]));
  setGoodFlowObserver(flow => {
    if (flow.marketId === undefined || !(flow.units > 0)) return;
    const market = markets.get(flow.marketId) ?? getMarkets().find(m => m.i === flow.marketId);
    const price = market?.goods[flow.goodId]?.price ?? 0;
    const name = names.get(flow.goodId) ?? String(flow.goodId);
    const row = ((flows[flow.marketId] ??= {})[name] ??= {});
    const cell = (row[`${flow.direction} ${flow.category}`] ??= [0, 0]);
    cell[0] += flow.units;
    cell[1] += flow.units * price;
  });
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    if (m % 12 === 0) {
      const treasury = Object.fromEntries(getMarkets().map(market => [market.i, market.marketTreasury?.balance ?? 0]));
      years.push({ date: [host.simulation.currentYear, host.simulation.currentMonth], treasury, flows });
      flows = {};
    }
    console.error(`[product-sales] ${m}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify({
      schemaVersion: 1,
      inputSha256: createHash("sha256").update(bytes).digest("hex"),
      months,
      notes: ["flows: market -> good -> 'direction category' -> [units, units x the Market's price at the time]."],
      years
    })}\n`
  );
} finally {
  setGoodFlowObserver(null);
  host.dispose();
}
