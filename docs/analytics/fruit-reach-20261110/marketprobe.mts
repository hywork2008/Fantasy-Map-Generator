/**
 * Raisins and wine by market (docs/analytics/fruit-reach-20261110.md). Read-only: after the first
 * and the second year it takes each market's cumulative food-processing ledger for Raisins and
 * Wine, its own grape harvest, its wine-country share, its town people and the goods' stock and price,
 * so the second year shows which markets eat and drink what they make and which take it from others.
 * A trade-stage observer counts, in the second year, the exporter -> importer pairs of each good at each
 * gate of the global trade matching (with the reach refusal), and the units of the deals struck.
 *
 *   npx tsx docs/analytics/fruit-reach-20261110/marketprobe.mts <map.fmg> <out.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getWorldContext } from "../../../src/extensions/economy/economyContext";
import { getWineCountryShare } from "../../../src/extensions/economy/generators/foodProcessingLedger";
import { setTradeStageObserver } from "../../../src/extensions/economy/generators/tradeStageObserver";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";

const GOODS = ["Raisins", "Wine", "Grapes"];
const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 24);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const takes: Record<number, unknown>[] = [];
const goodNameById = new Map(getGoods().map(good => [good.i, good.name]));
const stages: Record<string, Record<string, number>> = {};
const deals: Record<string, Record<string, number>> = {};
let observing = false;
setTradeStageObserver(event => {
  if (!observing) return;
  const name = goodNameById.get(event.goodId);
  if (!name || !GOODS.includes(name)) return;
  const key = event.reason ? `${event.stage}:${event.reason}` : event.stage;
  const row = (stages[name] ??= {});
  row[key] = (row[key] ?? 0) + 1;
  if (event.stage === "deal") {
    const pair = `${event.exporterId}>${event.importerId}`;
    const byPair = (deals[name] ??= {});
    byPair[pair] = (byPair[pair] ?? 0) + (event.units ?? 0);
  }
});
for (let month = 1; month <= months; month++) {
  observing = month > 12;
  await advanceWorld(host, { months: 1 });
  console.log(`[marketprobe] ${input} month ${month}`);
  if (month % 12 !== 0) continue;
  const world = getWorldContext();
  const goods = getGoods();
  const take: Record<number, unknown> = {};
  for (const market of getMarkets()) {
    let townPeople = 0;
    for (const burg of world.pack.burgs)
      if (burg.i && !burg.removed && burg.market === market.i) townPeople += (burg.population ?? 0) * 1000;
    const row: Record<string, unknown> = {
      townPeople,
      wineCountryShare: getWineCountryShare(market),
      x: world.pack.burgs[market.centerBurgId]?.x,
      y: world.pack.burgs[market.centerBurgId]?.y
    };
    for (const name of GOODS) {
      const good = goods.find(candidate => candidate.name === name);
      const ledger = (market.foodProcessingLedger as Record<string, Record<string, number>> | undefined)?.[name] ?? {};
      row[name] = {
        ...Object.fromEntries(Object.entries(ledger).filter(([, v]) => typeof v === "number")),
        stock: good ? (market.goods[good.i]?.stock ?? 0) : 0,
        price: good ? (market.goods[good.i]?.price ?? 0) : 0
      };
    }
    take[market.i] = row;
  }
  takes.push({ month, markets: take });
  writeFileSync(output, JSON.stringify({ input, takes, stages, deals }));
}
process.exit(0);
