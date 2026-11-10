/**
 * Hay and farmgate purchases capped by market cash: reads the temporary __diagHay/__diagGrain
 * accumulators (diag patch in livestockFeed.ts / foodProduction.ts), per Market and year, with
 * year-end balance and rural people per Market.
 * Usage: haycap.mts <archive.fmg> <output.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getMarketCellColumn } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/cellTables";
import { getRuralPopulationByMarket } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/householdWealth";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";

const [input, output, length = "84"] = process.argv.slice(2);
const months = Number(length);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
const g = globalThis as any;
const years: unknown[] = [];
for (let m = 1; m <= months; m++) {
  await advanceWorld(host, { months: 1 });
  if (m % 12 === 0) {
    const rural = getRuralPopulationByMarket(getMarketCellColumn());
    const end: Record<number, unknown> = {};
    for (const market of getMarkets() as any[])
      end[market.i] = { balance: Math.round(market.marketTreasury?.balance ?? 0), rural: Math.round(rural.get(market.i) ?? 0) };
    years.push({ month: m, hay: g.__diagHay ?? {}, grain: g.__diagGrain ?? {}, end });
    g.__diagHay = {};
    g.__diagGrain = {};
    writeFileSync(output, JSON.stringify({ months: m, years }));
    console.log("month", m);
  }
}
host.dispose();
