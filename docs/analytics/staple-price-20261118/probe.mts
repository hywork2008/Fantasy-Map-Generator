/**
 * Why the staple stays at its floor under the harvest-coverage price
 * (docs/analytics/staple-price-20261118.md): per market and month, the food ledger's stock,
 * the demand the price weighs it against, farmers' offers and the staple price.
 *   npx tsx docs/analytics/staple-price-20261118/probe.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getMarkets } from "../../../src/extensions/economy/context/trade";
import { getStapleFoodGood } from "../../../src/extensions/economy/generators/foodProduction";
import { setMarketSettings } from "../../../src/simulation/marketSettings";
import { getMarketPriceLevel } from "../../../src/extensions/economy/generators/currencySufficiency";

const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 15);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
setMarketSettings(JSON.parse(process.env.FMG_SETTINGS ?? "{}"));
const staple = getStapleFoodGood()!;
const out: unknown[] = [];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const markets = getMarkets()
    .filter(m => m?.foodLedger)
    .map(m => {
      const l = m.foodLedger!;
      return {
        i: m.i,
        stock: l.foodStockAge0 + l.foodStockAge1 + l.foodStockAge2 + (l.foodStockAge3 ?? 0),
        ages: [l.foodStockAge0, l.foodStockAge1, l.foodStockAge2, l.foodStockAge3 ?? 0],
        urbanNeed: l.urbanNeed,
        ruralMarketDraw: l.ruralMarketDraw,
        brewingGrainDemand: l.brewingGrainDemand,
        urbanFoodStats: l.urbanNeed,
        ruralNeed: l.ruralNeed,
        foodProduced: l.foodProduced,
        exportable: l.exportable,
        exportReserve: l.exportReserve,
        offered: l.offeredIntakeByMonth,
        spoiled: l.storageSpoiled,
        price: m.goods?.[staple.i]?.price,
        priceLevel: getMarketPriceLevel(m)
      };
    });
  out.push({ month, markets });
  console.log("month", month);
}
writeFileSync(output, JSON.stringify(out));
