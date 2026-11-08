/**
 * Markets by mean temperature band and the land cells Barilla's rule allows, for choosing the maps
 * of docs/analytics/barilla-20261108.md.
 *
 *   npx tsx docs/analytics/barilla-20261108/tempprobe.mts <map.fmg>...
 */
import { readFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getMarketCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";

for (const input of process.argv.slice(2)) {
  const host = createNodeSimulationHost();
  await host.loadArchive(new Uint8Array(readFileSync(input)));
  await host.prepare();
  const { pack, grid } = getWorldContext();
  const rule = getGoods().find(good => good.name === "Barilla")?.distribution ?? "false";
  const cellMarket = getMarketCellColumn();
  const temps = new Map<number, { sum: number; cells: number }>();
  let eligible = 0;
  for (const cellId of pack.cells.i) {
    if (pack.cells.h[cellId] < 20) continue;
    const methods = Goods.getMethods(cellId);
    if (new Function(`{${Object.keys(methods).join(", ")}}`, `return ${rule}`)(methods)) eligible++;
    const m = cellMarket?.[cellId] ?? 0;
    if (!m) continue;
    const row = temps.get(m) ?? { sum: 0, cells: 0 };
    row.sum += grid.cells.temp[pack.cells.g[cellId]];
    row.cells++;
    temps.set(m, row);
  }
  const bands: Record<string, number> = {};
  for (const market of getMarkets()) {
    const row = temps.get(market.i);
    const t = row ? row.sum / row.cells : NaN;
    const b = t >= 18 ? ">=18" : t >= 14 ? "14-18" : t >= 8 ? "8-14" : t < 8 ? "<8" : "none";
    bands[b] = (bands[b] ?? 0) + 1;
  }
  console.log(input, JSON.stringify({ markets: getMarkets().length, bands, barillaEligible: eligible }));
}
process.exit(0);
