/**
 * Where a map's Clay can be and is (docs/analytics/cold-clay-20261107.md). Read-only, at the map's
 * start: for every land cell on a shore or river, its biome, mean annual temperature band and rural
 * people, whether it holds a Clay deposit, and per market whether any of its cells holds Clay.
 *
 *   npx tsx docs/analytics/cold-clay-20261107/clayprobe.mts <map.fmg> <out.json> [good name, default Clay]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getGoodCellColumn, getMarketCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";

const [input, output, goodName = "Clay"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
const world = getWorldContext();
const { pack, grid, biomesData } = world;
const clay = getGoods().find(good => good.name === goodName)!;
const column = getGoodCellColumn();
const band = (t: number) => (t >= 8 ? ">=8" : t >= 4 ? "4-8" : t >= 0 ? "0-4" : t >= -5 ? "-5-0" : "<-5");
const rows: Record<string, { cells: number; eligible: number; clay: number; people: number }> = {};
for (const cellId of pack.cells.i) {
  if (pack.cells.h[cellId] < 20) continue;
  const biome = biomesData.name[pack.cells.biomeCode[cellId]];
  const t = grid.cells.temp[pack.cells.g[cellId]];
  const key = `${biome}|${band(t)}`;
  rows[key] ??= { cells: 0, eligible: 0, clay: 0, people: 0 };
  const row = rows[key];
  row.cells++;
  row.people += pack.cells.pop[cellId] ?? 0;
  if (pack.cells.t[cellId] === 1 || pack.cells.r[cellId]) row.eligible++;
  if (column[cellId] === clay.i) row.clay++;
}
const marketCells = new Map<number, { clay: number; people: number; temp: number; cells: number }>();
const cellMarket = getMarketCellColumn();
for (const cellId of pack.cells.i) {
  if (pack.cells.h[cellId] < 20) continue;
  const m = cellMarket?.[cellId] ?? 0;
  if (!m) continue;
  const row = marketCells.get(m) ?? { clay: 0, people: 0, temp: 0, cells: 0 };
  if (column[cellId] === clay.i) row.clay++;
  row.people += pack.cells.pop[cellId] ?? 0;
  row.temp += grid.cells.temp[pack.cells.g[cellId]];
  row.cells++;
  marketCells.set(m, row);
}
const markets = getMarkets().map(market => {
  const row = marketCells.get(market.i);
  return { i: market.i, clayCells: row?.clay ?? 0, people: row?.people ?? 0, meanTemp: row ? row.temp / row.cells : null };
});
writeFileSync(output, JSON.stringify({ input, rows, markets, cellMarket: Boolean(cellMarket) }));
console.log(`[clayprobe] ${input}`);
process.exit(0);
