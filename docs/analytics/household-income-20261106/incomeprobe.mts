/**
 * Where town households get their cash and where it goes, against the price of the ale they are
 * asked to drink (docs/analytics/household-income-20261106.md). Read-only: the household wealth
 * flow observer tallies every urban credit and debit by the calling function, per market, and each
 * month records urban people, ale demand and price, the ale drunk (cumulative), the staple retail
 * price and the household purse. Raids off; peace via env.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/household-income-20261106/incomeprobe.mts <map.fmg> <out.json> [months=24]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getAleDemandSnapshot } from "../../../src/extensions/economy/generators/foodProcessingLedger";
import {
  getHouseholdWealth,
  setHouseholdWealthFlowObserver
} from "../../../src/extensions/economy/generators/burgMarketLedgers";

const [input, output, monthsArg = "24"] = process.argv.slice(2);
const r2 = (v: number) => Math.round((v ?? 0) * 100) / 100;
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
{
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-caravan-raids": "off" };
}

// Stack frames: Error, observer, credit/debitHouseholdWealth, then three callers.
Error.stackTraceLimit = 7;
const frameName = (line: string | undefined) => {
  const match = line?.trim().match(/^at (?:async )?([^\s(]+)/);
  return match ? match[1].replace(/^Object\./, "") : "?";
};
const burgMarket = new Map<number, number>();
// market -> source -> [credited, debited]
let flows = new Map<number, Map<string, number[]>>();
setHouseholdWealthFlowObserver((burgId, amount) => {
  const lines = new Error().stack?.split("\n") ?? [];
  const source = [3, 4, 5].map(i => frameName(lines[i])).join("<");
  const market = burgMarket.get(burgId) ?? 0;
  const bySource = flows.get(market) ?? new Map<string, number[]>();
  flows.set(market, bySource);
  const row = bySource.get(source) ?? [0, 0];
  if (amount > 0) row[0] += amount;
  else row[1] -= amount;
  bySource.set(source, row);
});

const beer = getGoods().find(g => g.name === "Beer");
const grain = getGoods().find(g => g.name === "Grain");
const snapshots: unknown[] = [];
const months = Number(monthsArg);
for (let month = 1; month <= months; month++) {
  const world = getWorldContext();
  const burgs = (world.pack.burgs as { i: number; removed?: boolean; market?: number; population?: number }[]).filter(
    b => b?.i && !b.removed
  );
  burgMarket.clear();
  for (const b of burgs) if (b.market) burgMarket.set(b.i, b.market);
  await advanceWorld(host, { months: 1 });
  const markets = getMarkets().map(m => {
    const own = burgs.filter(b => b.market === m.i);
    const ledger = (m as { foodProcessingLedger?: { Beer?: { householdConsumption?: number } } }).foodProcessingLedger;
    const sources: Record<string, number[]> = {};
    for (const [key, row] of flows.get(m.i) ?? []) sources[key] = [r2(row[0]), r2(row[1])];
    return {
      i: m.i,
      urbanPeople: Math.round(own.reduce((a, b) => a + (b.population ?? 0), 0) * Math.max(1, world.populationRate ?? 1)),
      aleDemand: r2(getAleDemandSnapshot(m).monthlyDemand),
      beerPrice: r2(beer ? (m.goods[beer.i]?.price ?? 0) : 0),
      beerDrunkTotal: r2(ledger?.Beer?.householdConsumption ?? 0),
      grainPrice: r2(grain ? (m.goods[grain.i]?.price ?? 0) : 0),
      urbanHouseholdWealth: r2(own.reduce((a, b) => a + getHouseholdWealth(b.i), 0)),
      sources
    };
  });
  snapshots.push({ month, markets });
  flows = new Map();
  console.log(`month ${month}`);
}
writeFileSync(output, JSON.stringify({ input, months, snapshots }));
process.exit(0);
