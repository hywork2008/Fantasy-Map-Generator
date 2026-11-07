/**
 * Clay, Ceramics and Brick by the markets' mean temperature (docs/analytics/cold-clay-20261107.md).
 * With `add`, the saved deposits stay and Clay is added (seeded) on the cells only the new rule allows,
 * at the rate the map's generation reached on the old rule's cells. With `regen`, the deposits are laid
 * out again as the Goods editor's placement regeneration does. Otherwise they stay as saved. A
 * goods-flow observer sums each month the three goods' flows by direction, category and the
 * market's temperature band; at each month's end it sums their stock and stock value by band.
 *
 *   npx tsx docs/analytics/cold-clay-20261107/clayflow.mts <map.fmg> <out.json> <months> [add|regen]
 */
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getGoodCellColumn, getMarketCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";

const NAMES = ["Clay", "Ceramics", "Brick"];
const [input, output, monthsArg, mode] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const world = getWorldContext();
const { pack, grid } = world;
const clay = getGoods().find(good => good.name === "Clay")!;
const legacyRule = "minTemp(8) && (shore(1) || river())";
const ruleHolds = (rule: string, cellId: number) => {
  const methods = Goods.getMethods(cellId);
  return Boolean(new Function(`{${Object.keys(methods).join(", ")}}`, `return ${rule}`)(methods));
};
const added = { warmEligible: 0, warmClay: 0, rate: 0, newEligible: 0, placed: 0 };
if (mode === "regen") {
  Math.random = Alea(`clay-${world.seed}`);
  Goods.regeneratePlacement(clay.i);
} else if (mode === "add") {
  // Keep the saved deposits; add Clay where only the new rule allows it, at the rate the map's
  // generation reached on the old rule's cells (other goods compete there for the same cell).
  const random = Alea(`clay-${world.seed}`);
  const goodColumn = getGoodCellColumn();
  const fresh: number[] = [];
  for (const cellId of pack.cells.i) {
    if (pack.cells.h[cellId] < 20) continue;
    if (ruleHolds(legacyRule, cellId)) {
      added.warmEligible++;
      if (goodColumn[cellId] === clay.i) added.warmClay++;
    } else if (ruleHolds(clay.distribution!, cellId)) {
      added.newEligible++;
      if (!goodColumn[cellId]) fresh.push(cellId);
    }
  }
  added.rate = added.warmEligible ? added.warmClay / added.warmEligible : 0;
  for (const cellId of fresh) {
    if (random() >= added.rate * (added.newEligible / Math.max(1, fresh.length))) continue;
    goodColumn[cellId] = clay.i;
    added.placed++;
  }
}
const band = (t: number) => (t >= 8 ? ">=8" : t >= 4 ? "4-8" : t >= 0 ? "0-4" : "<0");
const cellMarket = getMarketCellColumn();
const temps = new Map<number, { sum: number; cells: number }>();
for (const cellId of pack.cells.i) {
  if (pack.cells.h[cellId] < 20) continue;
  const m = cellMarket?.[cellId] ?? 0;
  if (!m) continue;
  const row = temps.get(m) ?? { sum: 0, cells: 0 };
  row.sum += grid.cells.temp[pack.cells.g[cellId]];
  row.cells++;
  temps.set(m, row);
}
const bandByMarket = new Map<number, string>();
for (const market of getMarkets()) {
  const row = temps.get(market.i);
  bandByMarket.set(market.i, row ? band(row.sum / row.cells) : "none");
}
const column = getGoodCellColumn();
const clayCells: Record<string, number> = {};
const clayByCellBand: Record<string, number> = {};
for (const cellId of pack.cells.i) {
  if (column[cellId] !== clay.i) continue;
  const b = bandByMarket.get(cellMarket?.[cellId] ?? 0) ?? "none";
  clayCells[b] = (clayCells[b] ?? 0) + 1;
  const c = band(grid.cells.temp[pack.cells.g[cellId]]);
  clayByCellBand[c] = (clayByCellBand[c] ?? 0) + 1;
}
const marketsByBand: Record<string, number> = {};
for (const b of bandByMarket.values()) marketsByBand[b] = (marketsByBand[b] ?? 0) + 1;
const byName = new Map(getGoods().map(good => [good.name, good]));
const nameById = new Map(getGoods().map(good => [good.i, good.name]));
let flows: Record<string, number> = {};
setGoodFlowObserver(flow => {
  const name = nameById.get(flow.goodId) ?? "";
  if (!NAMES.includes(name)) return;
  const b = bandByMarket.get(flow.marketId ?? 0) ?? "none";
  const key = `${name}:${b}:${flow.direction}:${flow.category}`;
  flows[key] = (flows[key] ?? 0) + flow.units;
});
const snapshots = [];
for (let month = 1; month <= months; month++) {
  flows = {};
  await advanceWorld(host, { months: 1 });
  const stocks: Record<string, { stock: number; value: number }> = {};
  for (const market of getMarkets()) {
    const b = bandByMarket.get(market.i) ?? "none";
    for (const name of NAMES) {
      const good = byName.get(name);
      const row = good ? market.goods[good.i] : undefined;
      if (!row) continue;
      const key = `${name}:${b}`;
      stocks[key] ??= { stock: 0, value: 0 };
      stocks[key].stock += row.stock;
      stocks[key].value += row.stock * row.price;
    }
  }
  snapshots.push({ month, flows, stocks });
  writeFileSync(output, JSON.stringify({ input, mode: mode ?? "saved", added, clayCells, clayByCellBand, marketsByBand, snapshots }));
  console.log(`[clayflow] ${input} month ${month}`);
}
setGoodFlowObserver(null);
process.exit(0);
