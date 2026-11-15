/**
 * Trade gates of Barilla (docs/analytics/barilla-soap-20261108.md): barillaflow.mts with a trade-stage
 * observer that counts, each month, the exporter -> importer pairs of Barilla at each gate of the global
 * trade matching (with the reach refusal), and the Barilla stock and price of each market holding some.
 * From barillaflow.mts: Barilla, Glass, Potash and White sand by the markets' mean temperature (docs/analytics/barilla-20261108.md),
 * from clayflow.mts (docs/analytics/cold-clay-20261107.md). Barilla, which saved maps have no deposits of,
 * is seeded on the free land cells its rule allows at its own chance, as a new map's placement rolls it,
 * up to the placement's cap. The bands are <8, 8-14, 14-18 and >=18 degrees. Recipe inputs are keyed by
 * the good they went into ("Potash:14-18:sink:recipeInput>Glass"). From clayflow.mts: With `add`, the saved deposits stay and each listed deposit good
 * (default Clay) is added (seeded) on the cells only the new rule allows,
 * at the rate the map's generation reached on the old rule's cells. With `regen`, the deposits are laid
 * out again as the Goods editor's placement regeneration does. Otherwise they stay as saved. A
 * goods-flow observer sums each month the goods' flows by direction, category and the
 * market's temperature band; at each month's end it sums their stock and stock value by band.
 * CLAYFLOW_GOODS (comma-separated names) replaces the goods watched. Each month also sums the
 * markets' forest glasshouse ledgers by band, and at the start the forest cells' standing hectares
 * and yearly regrowth (docs/analytics/glass-houses-20261107.md).
 *
 *   npx tsx docs/analytics/barilla-20261108/barillaflow.mts <map.fmg> <out.json> <months> [add|regen] [Clay,White sand]
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
import { setTradeStageObserver } from "../../../src/extensions/economy/generators/tradeStageObserver";
import {
  FOREST_REGROWTH_PER_YEAR,
  getForestCapacity,
  getForestStockRatio,
  getWoodUnitsPerForestCoverage
} from "../../../src/generators/forestStock";
import { calculatePhysicalAreaHectares } from "../../../src/extensions/economy/generators/agriculturalLandUse";

const NAMES = process.env.CLAYFLOW_GOODS?.split(",") ?? ["Barilla", "Glass", "Potash", "White sand"];
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
// Barilla on the cells its rule allows, at its chance, up to the placement's cap (goods-generator.ts).
const barilla = getGoods().find(good => good.name === "Barilla");
const barillaSeed = { eligible: 0, placed: 0 };
if (barilla?.distribution && barilla.chance) {
  const goodColumn = getGoodCellColumn();
  const random = Alea(`barilla-${world.seed}`);
  const cap = Math.ceil((200 * pack.cells.i.length) / 5000);
  for (const cellId of pack.cells.i) {
    if (pack.cells.h[cellId] < 20 || goodColumn[cellId] === barilla.i) continue;
    if (!ruleHolds(barilla.distribution, cellId)) continue;
    barillaSeed.eligible++;
    if (goodColumn[cellId] || barillaSeed.placed >= cap || random() * 100 > barilla.chance) continue;
    goodColumn[cellId] = barilla.i;
    barillaSeed.placed++;
  }
}
const band = (t: number) => (t >= 18 ? ">=18" : t >= 14 ? "14-18" : t >= 8 ? "8-14" : "<8");
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
for (const name of ["Clay", "White sand", "Barilla"]) {
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
// Forest cells by market band: standing hectares and the Wood units they regrow in a year.
const forest: Record<string, { standingHa: number; regrowthUnits: number }> = {};
for (const cellId of pack.cells.i) {
  if (pack.cells.h[cellId] < 20) continue;
  if (!(world.biomesData.tags?.[pack.cells.biomeCode[cellId]] ?? []).includes("forest")) continue;
  const b = bandByMarket.get(cellMarket?.[cellId] ?? 0) ?? "none";
  const capacity = getForestCapacity(pack.cells, cellId);
  forest[b] ??= { standingHa: 0, regrowthUnits: 0 };
  forest[b].standingHa += calculatePhysicalAreaHectares(world, cellId) * capacity * getForestStockRatio(pack.cells, cellId);
  forest[b].regrowthUnits += getWoodUnitsPerForestCoverage(world, cellId) * capacity * FOREST_REGROWTH_PER_YEAR;
}
const byName = new Map(getGoods().map(good => [good.name, good]));
const nameById = new Map(getGoods().map(good => [good.i, good.name]));
let flows: Record<string, number> = {};
setGoodFlowObserver(flow => {
  const name = nameById.get(flow.goodId) ?? "";
  if (!NAMES.includes(name)) return;
  const b = bandByMarket.get(flow.marketId ?? 0) ?? "none";
  const related = flow.category === "recipeInput" && flow.relatedGoodId ? `>${nameById.get(flow.relatedGoodId)}` : "";
  const key = `${name}:${b}:${flow.direction}:${flow.category}${related}`;
  flows[key] = (flows[key] ?? 0) + flow.units;
});
const barillaId = getGoods().find(good => good.name === "Barilla")!.i;
let stages: Record<string, number> = {};
let samples: Record<string, unknown>[] = [];
setTradeStageObserver(event => {
  if (event.goodId !== barillaId) return;
  const key = `${event.stage}${event.reason ? `:${event.reason}` : ""}${event.transportLimit ? `:${event.transportLimit}` : ""}`;
  stages[key] = (stages[key] ?? 0) + 1;
  if (samples.length < 40 && event.stage !== "pair")
    samples.push({ ...event, importerBand: bandByMarket.get(event.importerId) ?? "none" });
});
const snapshots = [];
for (let month = 1; month <= months; month++) {
  flows = {};
  stages = {};
  samples = [];
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
  const glasshouses: Record<string, Record<string, number>> = {};
  for (const market of getMarkets()) {
    const ledger = market.forestGlasshouses;
    if (!ledger) continue;
    const b = bandByMarket.get(market.i) ?? "none";
    const row = (glasshouses[b] ??= { markets: 0, capacityLots: 0, lots: 0, woodFelled: 0, cumulativeWoodFelled: 0 });
    if (ledger.capacityLots > 0) row.markets++;
    row.capacityLots += ledger.capacityLots;
    row.lots += ledger.lots;
    row.woodFelled += ledger.woodFelled;
    row.cumulativeWoodFelled += ledger.cumulativeWoodFelled ?? 0;
    for (const key of ["houses", "housesGrown", "housesLeft", "housesArrived", "yearShortLots"] as const)
      row[key] = (row[key] ?? 0) + (ledger[key] ?? 0);
  }
  const holders = getMarkets()
    .filter(market => (market.goods[barillaId]?.stock ?? 0) > 0)
    .map(market => ({ market: market.i, band: bandByMarket.get(market.i) ?? "none", stock: market.goods[barillaId].stock, price: market.goods[barillaId].price }));
  const prices = getMarkets().map(market => market.goods[barillaId]?.price ?? null);
  snapshots.push({ month, flows, stocks, glasshouses, stages, samples, holders, prices });
  writeFileSync(output, JSON.stringify({ input, mode: mode ?? "saved", added, barillaSeed, depositCells, clayCells, clayByCellBand, marketsByBand, forest, snapshots }));
  console.log(`[tradeprobe] ${input} month ${month}`);
}
setGoodFlowObserver(null);
process.exit(0);
