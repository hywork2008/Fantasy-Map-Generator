/**
 * What becomes of the casks the coopers make (docs/analytics/cooper-funds-20261106.md).
 * Read-only: wraps Markets.sell to tally, per market and good, the units the towns offered and the
 * units the market bought (and the value over every good), and each month records the market treasury and the treasuries of the
 * towns, the household purses, ale demand and the ale drunk (cumulative), and what the market
 * holds on consignment and owes (docs/plan/market-goods-settlement.md). Raids off; peace via env.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/cooper-funds-20261106/sellprobe.mts <map.fmg> <out.json> [months=30]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { Markets } from "../../../src/extensions/economy/generators/markets-generator";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";
import { getAleDemandSnapshot } from "../../../src/extensions/economy/generators/foodProcessingLedger";
import { getHouseholdWealth } from "../../../src/extensions/economy/generators/burgMarketLedgers";

const [input, output, monthsArg = "30"] = process.argv.slice(2);
const r2 = (v: number) => Math.round((v ?? 0) * 100) / 100;
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
{
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-caravan-raids": "off" };
  // FMG_MARKET_SETTINGS='{"householdGoodsPayment":"free"}' overrides market settings for a variant run.
  if (process.env.FMG_MARKET_SETTINGS) {
    const stored = sim.worldSettings["fmg-market-settings"];
    sim.worldSettings["fmg-market-settings"] = JSON.stringify({
      ...(stored ? JSON.parse(stored) : {}),
      ...JSON.parse(process.env.FMG_MARKET_SETTINGS)
    });
  }
}
const watched = new Map(getGoods().filter(g => ["Barrels", "Beer", "Wood"].includes(g.name)).map(g => [g.i, g.name]));
// "market:good" -> [offered, sold, value offered, offers refused outright]
let sales = new Map<string, number[]>();
// "market:good" -> recipeInput units drawn from the market
let inputs = new Map<string, number>();
// market -> [value offered, value bought] over every good
let allGoods = new Map<number, number[]>();
const original = Markets.sell.bind(Markets);
(Markets as { sell: typeof Markets.sell }).sell = (args => {
  const deal = original(args);
  const price = Markets.get(args.burg.market!)?.goods[args.good.i]?.price ?? 0;
  const total = allGoods.get(args.burg.market!) ?? [0, 0];
  total[0] += args.units * price;
  total[1] += (deal?.units ?? 0) * (deal?.price ?? price);
  allGoods.set(args.burg.market!, total);
  const name = watched.get(args.good.i);
  if (name) {
    const key = `${args.burg.market}:${name}`;
    const row = sales.get(key) ?? [0, 0, 0, 0];
    row[0] += args.units;
    row[1] += deal?.units ?? 0;
    row[2] += args.units * (Markets.get(args.burg.market!)?.goods[args.good.i]?.price ?? 0);
    if (!deal) row[3]++;
    sales.set(key, row);
  }
  return deal;
}) as typeof Markets.sell;
setGoodFlowObserver(flow => {
  const name = watched.get(flow.goodId);
  if (!name || flow.direction !== "sink" || flow.category !== "recipeInput") return;
  const key = `${flow.marketId}:${name}`;
  inputs.set(key, (inputs.get(key) ?? 0) + flow.units);
});

const snapshots: unknown[] = [];
const months = Number(monthsArg);
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const world = getWorldContext();
  const burgs = (world.pack.burgs as { i: number; removed?: boolean; market?: number; treasury?: number; population?: number }[])
    .filter(b => b?.i && !b.removed);
  const markets = getMarkets().map(m => {
    const own = burgs.filter(b => b.market === m.i);
    const rows: Record<string, unknown> = {};
    for (const name of watched.values()) {
      const s = sales.get(`${m.i}:${name}`) ?? [0, 0, 0, 0];
      rows[name] = { offered: r2(s[0]), sold: r2(s[1]), offeredValue: r2(s[2]), refused: s[3], drawn: r2(inputs.get(`${m.i}:${name}`) ?? 0) };
    }
    const t = m.marketTreasury as
      | { craftConsigned?: Record<number, Record<number, number[]>>; craftPayables?: Record<number, Record<number, number[]>> }
      | undefined;
    const sumWorth = (table?: Record<number, Record<number, number[]>>) =>
      Object.values(table ?? {}).reduce((a, rows) => a + Object.values(rows).reduce((b, row) => b + row[1], 0), 0);
    const beer = (m as { foodProcessingLedger?: { Beer?: { householdConsumption?: number } } }).foodProcessingLedger?.Beer;
    return {
      i: m.i,
      aleDemand: r2(getAleDemandSnapshot(m).monthlyDemand),
      beerDrunkTotal: r2(beer?.householdConsumption ?? 0),
      consignedWorth: r2(sumWorth(t?.craftConsigned)),
      payable: r2(sumWorth(t?.craftPayables)),
      urbanPeople: Math.round(own.reduce((a, b) => a + (b.population ?? 0), 0) * Math.max(1, world.populationRate ?? 1)),
      urbanHouseholdWealth: r2(own.reduce((a, b) => a + getHouseholdWealth(b.i), 0)),
      ruralHouseholdWealth: r2((m as { foodLedger?: { ruralHouseholdWealth?: number } }).foodLedger?.ruralHouseholdWealth ?? 0),
      treasury: r2(m.marketTreasury?.balance ?? 0),
      maintenance: r2(m.maintenanceCondition ?? 1),
      burgs: own.length,
      burgTreasury: r2(own.reduce((t, b) => t + Math.max(0, b.treasury ?? 0), 0)),
      burgsBroke: own.filter(b => !((b.treasury ?? 0) > 1)).length,
      allOfferedValue: r2(allGoods.get(m.i)?.[0] ?? 0),
      allBoughtValue: r2(allGoods.get(m.i)?.[1] ?? 0),
      goods: rows
    };
  });
  snapshots.push({ month, markets });
  sales = new Map();
  inputs = new Map();
  allGoods = new Map();
  console.log(`month ${month}`);
}
writeFileSync(output, JSON.stringify({ input, months, snapshots }));
process.exit(0);
