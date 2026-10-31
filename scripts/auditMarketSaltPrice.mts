/**
 * Salt price and rural salt bills by Market and month (docs/plan/livestock-salt-cash-share.md §4): the
 * market price, the reference it is pulled to (Salt value x price level x money level, or the landed
 * cost), the stock, the rural people, and the rural wallet's household and livestock salt payments.
 * Read-only apart from the audit hook. Usage: auditMarketSaltPrice.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getMarketCellColumn } from "../src/extensions/economy/context/cellTables";
import { getStateSaltLedgers } from "../src/extensions/economy/context/industry";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { getMarketPriceLevel, getMoneyPriceLevelForMarket } from "../src/extensions/economy/generators/currencySufficiency";
import { getRuralHouseholdWealth, setRuralHouseholdWealthFlowObserver } from "../src/extensions/economy/generators/householdWealth";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "./lib/conflictAutonomyFromEnv.mts";

const [input, output, length = "48"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1)
  throw new Error("Usage: auditMarketSaltPrice.mts <archive.fmg> <output.json> [months>=1]");

const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const rows: unknown[] = [];
let paid: Record<number, { household: number; livestock: number }> = {};

function saltChannel(): "household" | "livestock" | null {
  const stack = new Error().stack ?? "";
  if (stack.includes("saltFinance")) return "household";
  if (stack.includes("saltLogistics")) return "livestock";
  return null;
}

function ruralPeople(): Record<number, number> {
  const world = getWorldContext();
  const rate = Math.max(1, world.populationRate ?? 1);
  const column = getMarketCellColumn();
  const people: Record<number, number> = {};
  for (const id of world.pack.cells.i)
    if (world.pack.cells.h[id] >= 20) people[column[id]] = (people[column[id]] ?? 0) + world.pack.cells.pop[id] * rate;
  return people;
}

try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  applyConflictAutonomyFromEnv();
  setRuralHouseholdWealthFlowObserver((marketId, amount) => {
    const channel = amount < 0 ? saltChannel() : null;
    if (!channel) return;
    const row = (paid[marketId] ??= { household: 0, livestock: 0 });
    row[channel] -= amount;
  });
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    const salt = getGoods().find(good => good.name === "Salt");
    const people = ruralPeople();
    const markets: Record<number, unknown> = {};
    for (const market of getMarkets()) {
      const good = salt ? market.goods[salt.i] : undefined;
      markets[market.i] = {
        price: good?.price ?? 0,
        stock: good?.stock ?? 0,
        reference: (salt?.value ?? 0) * getMarketPriceLevel(market) * getMoneyPriceLevelForMarket(market),
        priceLevel: getMarketPriceLevel(market),
        moneyLevel: getMoneyPriceLevelForMarket(market),
        landed: market.saltLandedUnitCost ?? 0,
        ruralPeople: people[market.i] ?? 0,
        ruralWealth: getRuralHouseholdWealth(market),
        ...(paid[market.i] ?? { household: 0, livestock: 0 })
      };
    }
    const keys = [
      "monthlyOutputBags",
      "inTransitBags",
      "monthlyHouseholdDemandBags",
      "monthlyHouseholdSalesBags",
      "monthlyUnmetHouseholdBags",
      "monthlyLivestockDemandBags",
      "monthlyLivestockSuppliedBags",
      "monthlyUnmetLivestockBags",
      "monthlyProcessingForecastBags"
    ] as const;
    const world = Object.fromEntries(
      keys.map(key => [key, getStateSaltLedgers().reduce((sum, row) => sum + (row[key] ?? 0), 0)])
    );
    rows.push({ date: [host.simulation.currentYear, host.simulation.currentMonth], markets, world });
    paid = {};
    console.error(`[salt-price] ${m}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify({
      schemaVersion: 1,
      inputSha256: createHash("sha256").update(bytes).digest("hex"),
      months,
      notes: [
        "Per month and Market, after the month: Salt price, stock, reference (value x market price level x money price level), landed unit cost.",
        "household/livestock: the month's rural wallet debits from saltFinance and saltLogistics.",
        "world: the month's state salt ledgers summed over states."
      ],
      rows
    })}\n`
  );
} finally {
  setRuralHouseholdWealthFlowObserver(null);
  host.dispose();
}
