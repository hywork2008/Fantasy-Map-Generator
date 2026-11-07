/**
 * Why the towns make the Glass and Potash they do (docs/analytics/glass-houses-20261107.md). Read-only:
 * after each month, sums the towns' production diagnostics for the watched goods by the markets' mean
 * temperature band: each stage and constraint set's count, output lots and labor.
 *
 * With `add`, Clay and White sand are first added on the cold lands as clayflow.mts does
 * (docs/analytics/cold-clay-20261107/clayflow.mts).
 *
 *   npx tsx docs/analytics/glass-houses-20261107/glassdiag.mts <map.fmg> <out.json> <months> [goods] [add]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getMarketCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import Alea from "alea";
import { getGoodCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { getUrbanCraftCapacityRecords } from "../../../src/extensions/economy/generators/urbanCraftCapacity";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";

const [input, output, monthsArg, goodsArg, mode] = process.argv.slice(2);
const months = Number(monthsArg ?? 3);
const names = (goodsArg ?? "Glass,Potash").split(",");
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const world = getWorldContext();
const { pack, grid } = world;
if (mode === "add") {
  const legacyRule = "minTemp(8) && (shore(1) || river())";
  const ruleHolds = (rule: string, cellId: number) => {
    const methods = Goods.getMethods(cellId);
    return Boolean(new Function(`{${Object.keys(methods).join(", ")}}`, `return ${rule}`)(methods));
  };
  const goodColumn = getGoodCellColumn();
  for (const name of ["Clay", "White sand"]) {
    const good = getGoods().find(entry => entry.name === name)!;
    const random = Alea(`${name === "Clay" ? "clay" : name}-${world.seed}`);
    let warmEligible = 0;
    let warm = 0;
    let newEligible = 0;
    const fresh: number[] = [];
    for (const cellId of pack.cells.i) {
      if (pack.cells.h[cellId] < 20) continue;
      if (ruleHolds(legacyRule, cellId)) {
        warmEligible++;
        if (goodColumn[cellId] === good.i) warm++;
      } else if (ruleHolds(good.distribution!, cellId)) {
        newEligible++;
        if (!goodColumn[cellId]) fresh.push(cellId);
      }
    }
    const rate = warmEligible ? warm / warmEligible : 0;
    for (const cellId of fresh) {
      if (random() >= rate * (newEligible / Math.max(1, fresh.length))) continue;
      goodColumn[cellId] = good.i;
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
const nameById = new Map(getGoods().map(good => [good.i, good.name]));
const totals: Record<string, { count: number; outputLots: number; laborPoints: number }> = {};
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  for (const record of getUrbanCraftCapacityRecords()) {
    const b = bandByMarket.get(record.marketId) ?? "none";
    for (const row of record.productionDiagnostics?.rows ?? []) {
      const name = row.goodId === null ? "" : (nameById.get(row.goodId) ?? "");
      if (!names.includes(name)) continue;
      const key = `${name}|${b}|${row.stage}|${row.constraints.join("+") || "-"}`;
      totals[key] ??= { count: 0, outputLots: 0, laborPoints: 0 };
      totals[key].count += row.count;
      totals[key].outputLots += row.outputLots ?? 0;
      totals[key].laborPoints += row.laborPoints ?? 0;
    }
  }
  writeFileSync(output, JSON.stringify({ input, months: month, totals }));
  console.log(`[glassdiag] ${input} month ${month}`);
}
process.exit(0);
