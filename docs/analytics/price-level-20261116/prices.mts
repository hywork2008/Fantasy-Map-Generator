/**
 * Price level probe (docs/analytics/price-level-20261116.md): every month the money held by each holder,
 * and every 6 months the population-weighted median and mean price of every good across markets, the staple
 * retail price, the subsistence wage and the real population.
 *
 *   npx tsx docs/analytics/price-level-20261116/prices.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getBurgMarketLedgers, getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { personalCashTotal, readPersonalCash } from "../../../src/extensions/economy/generators/personalCash";
import { getSimulationCharacters as getCharacters } from "../../../src/extensions/characters/charactersContext";
import { getGuildKnowledgeStocks } from "../../../src/extensions/economy/context/knowledge";
import { getStapleFoodGood } from "../../../src/extensions/economy/generators/foodProduction";
import { getSubsistenceWage } from "../../../src/extensions/economy/generators/subsistenceWage";
import { getMoneyScale } from "../../../src/extensions/economy/generators/moneyScale";

const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 60);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const { pack } = getWorldContext();
const rate = (globalThis as any).populationRate ?? 1000;

function holders() {
  let rural = 0, market = 0, burg = 0, state = 0;
  for (const m of getMarkets()) {
    if (!m) continue;
    rural += m.foodLedger?.ruralHouseholdWealth ?? 0;
    market += m.marketTreasury?.balance ?? 0;
  }
  for (const b of pack.burgs ?? []) if (b?.i && !b.removed) burg += b.treasury ?? 0;
  for (const s of pack.states ?? []) if (s?.i && !s.removed) state += s.treasury ?? 0;
  return {
    rural, market, burg, state,
    guild: getGuildKnowledgeStocks().reduce((s, g) => s + (g.treasury ?? 0), 0),
    town: getBurgMarketLedgers().reduce((s, l) => s + (l.householdWealth ?? 0), 0),
    people: readPersonalCash() ? personalCashTotal() : getCharacters().reduce((s, c) => s + (c?.wealth ?? 0), 0)
  };
}
function population() {
  let rural = 0, urban = 0;
  const cells = pack.cells;
  for (const i of cells.i) rural += cells.pop[i] ?? 0;
  for (const b of pack.burgs ?? []) if (b?.i && !b.removed) urban += b.population ?? 0;
  return { ruralPoints: rural, urbanPoints: urban };
}
function prices() {
  const markets = getMarkets().filter(Boolean);
  const out: Record<string, unknown> = {};
  for (const good of getGoods()) {
    const rows: number[] = [];
    let stocked = 0;
    for (const m of markets) {
      const g = m.goods?.[good.i];
      if (g && g.price > 0) { rows.push(g.price); if (g.stock > 0) stocked++; }
    }
    if (!rows.length) continue;
    rows.sort((a, b) => a - b);
    out[good.name] = {
      unit: good.unit, value: good.value, n: rows.length, stocked,
      p10: rows[Math.floor(rows.length * 0.1)], median: rows[Math.floor(rows.length / 2)], p90: rows[Math.floor(rows.length * 0.9)]
    };
  }
  const staple = getStapleFoodGood();
  const wages = markets.map(m => getSubsistenceWage(m)).sort((a, b) => a - b);
  const stapleRetail = markets.map(m => m.goods?.[staple!.i]?.price ?? 0).filter(v => v > 0).sort((a, b) => a - b);
  return { goods: out, markets: markets.length, wageMedian: wages[Math.floor(wages.length / 2)],
    stapleMedian: stapleRetail[Math.floor(stapleRetail.length / 2)], stapleName: staple?.name };
}
const snaps: unknown[] = [{ month: 0, money: holders(), pop: population(), prices: prices() }];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const snap: Record<string, unknown> = { month, money: holders() };
  if (month % 6 === 0) { snap.pop = population(); snap.prices = prices(); }
  snaps.push(snap);
  console.log(`month ${month}`);
}
writeFileSync(output, JSON.stringify({ input, populationRate: rate, moneyScale: getMoneyScale(), snaps }));
