/**
 * Monthly salt, preserved food and livestock totals over all markets, and the burgs' purse
 * (docs/plan/urban-craft-staffing.md §10.2, §11). Read-only.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/economy-start-s2-20261102/foodprobe.mts <map.fmg> <out.json> [months=24]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";

const [input, output, monthsArg = "24"] = process.argv.slice(2);
const GOODS = [
  "Salt",
  "Preserved food",
  "Fish",
  "Cattle",
  "Pig",
  "Sheep",
  "Game",
  "Vinegar",
  "Tallow",
  "Candles",
  "Tar",
  "Beer",
  "Barrels",
  "Barley",
  "Wheat",
  "Rye",
  "Oats"
];
const r1 = (v: number) => Math.round(v * 10) / 10;

const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();

function snapshot(month: number) {
  const goods = getGoods();
  const markets = getMarkets();
  const byGood: Record<string, { stock: number; meanPrice: number }> = {};
  for (const name of GOODS) {
    const good = goods.find(g => g.name === name);
    if (!good) continue;
    let stock = 0;
    let priced = 0;
    let priceSum = 0;
    for (const market of markets) {
      const entry = (market.goods as any)[good.i];
      if (!entry) continue;
      stock += Math.max(0, entry.stock ?? 0);
      if (entry.price > 0) {
        priceSum += entry.price;
        priced++;
      }
    }
    byGood[name] = { stock: r1(stock), meanPrice: priced ? Math.round((priceSum / priced) * 1000) / 1000 : 0 };
  }
  const burgs = (getWorldContext().pack.burgs as any[]).filter(b => b?.i && !b.removed);
  const treasury = burgs.reduce((s, b) => s + (b.treasury ?? 0), 0);
  const population = burgs.reduce((s, b) => s + (b.population ?? 0), 0);
  // The towns' staple this month, from the food ledger (added for urban-craft-staffing.md §10.5).
  let urbanNeed = 0;
  let urbanSupplied = 0;
  for (const market of markets) {
    const consumption = market.foodLedger?.monthlyConsumption;
    urbanNeed += consumption?.urbanNeed ?? 0;
    urbanSupplied += consumption?.urbanSupplied ?? 0;
  }
  const urbanFedShare = urbanNeed > 0 ? Math.round((urbanSupplied / urbanNeed) * 1000) / 1000 : 0;
  return { month, goods: byGood, burgTreasury: Math.round(treasury), burgPopulation: r1(population), urbanFedShare };
}

const months = Number(monthsArg);
const snapshots = [snapshot(0)];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  snapshots.push(snapshot(month));
  console.log(`[foodprobe] ${input} month ${month}`);
}
writeFileSync(output, JSON.stringify({ input, snapshots }, null, 1));
