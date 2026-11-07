/**
 * Clay, Ceramics, Brick, White sand, Glass and Potash by the markets' mean temperature
 * (docs/analytics/cold-clay-20261107.md). With `add`, the saved deposits stay and each listed deposit good
 * (default Clay) is added (seeded) on the cells only the new rule allows,
 * at the rate the map's generation reached on the old rule's cells. With `regen`, the deposits are laid
 * out again as the Goods editor's placement regeneration does. Otherwise they stay as saved. A
 * goods-flow observer sums each month the goods' flows by direction, category and the
 * market's temperature band; at each month's end it sums their stock and stock value by band.
 * CLAYFLOW_GOODS (comma-separated names) replaces the goods watched.
 *
 *   npx tsx docs/analytics/cold-clay-20261107/clayflow.mts <map.fmg> <out.json> <months> [add|regen] [Clay,White sand]
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

const NAMES = process.env.CLAYFLOW_GOODS?.split(",") ?? ["Clay", "Ceramics", "Brick", "White sand", "Glass", "Potash"];
const [input, output, monthsArg, mode, depositsArg] = process.argv.slice(2);
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
const deposits = (depositsArg ?? "Clay").split(",");
const added: Record<string, { warmEligible: number; warmClay: number; rate: number; newEligible: number; placed: number }> = {};
if (mode === "regen") {
  Math.random = Alea(`clay-${world.seed}`);
  Goods.regeneratePlacement(clay.i);
} else if (mode === "add") {
  // Keep the saved deposits; add each deposit good where only the new rule allows it, at the rate the
  // map's generation reached on the old rule's cells (other goods compete there for the same cell).
  const goodColumn = getGoodCellColumn();
  for (const name of deposits) {
    const good = getGoods().find(entry => entry.name === name)!;
    const random = Alea(`${name === "Clay" ? "clay" : name}-${world.seed}`);
    const row = { warmEligible: 0, warmClay: 0, rate: 0, newEligible: 0, placed: 0 };
    added[name] = row;
    const fresh: number[] = [];
    for (const cellId of pack.cells.i) {
      if (pack.cells.h[cellId] < 20) continue;
      if (ruleHolds(legacyRule, cellId)) {
        row.warmEligible++;
        if (goodColumn[cellId] === good.i) row.warmClay++;
      } else if (ruleHolds(good.distribution!, cellId)) {
        row.newEligible++;
        if (!goodColumn[cellId]) fresh.push(cellId);
      }
    }
    row.rate = row.warmEligible ? row.warmClay / row.warmEligible : 0;
    for (const cellId of fresh) {
      if (random() >= row.rate * (row.newEligible / Math.max(1, fresh.length))) continue;
      goodColumn[cellId] = good.i;
      row.placed++;
    }
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
const depositCells: Record<string, Record<string, number>> = {};
for (const name of ["Clay", "White sand"]) {
  const good = getGoods().find(entry => entry.name === name);
  if (!good) continue;
  const row: Record<string, number> = {};
  for (const cellId of pack.cells.i) {
    if (column[cellId] !== good.i) continue;
    const b = bandByMarket.get(cellMarket?.[cellId] ?? 0) ?? "none";
    row[b] = (row[b] ?? 0) + 1;
  }
  depositCells[name] = row;
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
  writeFileSync(output, JSON.stringify({ input, mode: mode ?? "saved", added, depositCells, clayCells, clayByCellBand, marketsByBand, snapshots }));
  console.log(`[clayflow] ${input} month ${month}`);
}
setGoodFlowObserver(null);
process.exit(0);
