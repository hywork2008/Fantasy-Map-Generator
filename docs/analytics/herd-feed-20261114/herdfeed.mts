/**
 * Herd size and feed (docs/analytics/herd-feed-20261114.md): each month, per managed herd species the
 * summed heads and supported herd (carrying capacity), heads in cells whose herd is above it, and the
 * livestock feed ledger summed over cells: required, unmet, purchased and hay in store (kg). Market
 * settings come from the JSON in FMG_SETTINGS. Barilla is seeded as in barillaflow.mts.
 *
 *   npx tsx docs/analytics/herd-feed-20261114/herdfeed.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getFaunaStockTable, getGoodCellColumn, getOrCreateLivestockFeedTable } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getSimulationMonth } from "../../../src/extensions/economy/economyContext";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { getGoods } from "../../../src/extensions/economy/context/trade";
import { getDomesticatedCarryingCapacity, isManagedHerdGood } from "../../../src/extensions/economy/generators/faunaPopulation";
import { setMarketSettings } from "../../../src/simulation/marketSettings";

const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const settings = JSON.parse(process.env.FMG_SETTINGS ?? "{}");
setMarketSettings(settings);
const world = getWorldContext();
const { pack } = world;
const ruleHolds = (rule: string, cellId: number) => {
  const methods = Goods.getMethods(cellId);
  return Boolean(new Function(`{${Object.keys(methods).join(", ")}}`, `return ${rule}`)(methods));
};
const barilla = getGoods().find(good => good.name === "Barilla");
if (barilla?.distribution && barilla.chance) {
  const goodColumn = getGoodCellColumn();
  const random = Alea(`barilla-${world.seed}`);
  const cap = Math.ceil((200 * pack.cells.i.length) / 5000);
  let placed = 0;
  for (const cellId of pack.cells.i) {
    if (pack.cells.h[cellId] < 20 || goodColumn[cellId] === barilla.i) continue;
    if (!ruleHolds(barilla.distribution, cellId)) continue;
    if (goodColumn[cellId] || placed >= cap || random() * 100 > barilla.chance) continue;
    goodColumn[cellId] = barilla.i;
    placed++;
  }
}
const herds = getGoods().filter(good => isManagedHerdGood(good.name));
const r0 = (v: number) => Math.round(v);
function snapshot() {
  const table = getFaunaStockTable() ?? {};
  const species: Record<string, { heads: number; capacity: number; overHeads: number; overCapacity: number; cells: number }> = {};
  for (const [key, c] of Object.entries(table)) {
    const [cell, name] = key.split(":");
    const good = herds.find(g => g.name === name);
    if (!good) continue;
    const heads = c.young + c.breeding + c.old;
    const capacity = getDomesticatedCarryingCapacity(Number(cell), good, 0);
    const row = (species[name] ??= { heads: 0, capacity: 0, overHeads: 0, overCapacity: 0, cells: 0 });
    row.heads += heads;
    row.capacity += capacity;
    row.cells++;
    if (heads > capacity) {
      row.overHeads += heads;
      row.overCapacity += capacity;
    }
  }
  const feed = { requiredKg: 0, unmetKg: 0, purchasedKg: 0, hayKg: 0, cells: 0, shortCells: 0 };
  for (const row of Object.values(getOrCreateLivestockFeedTable() ?? {})) {
    if (!row || !(row.requiredKg > 0)) continue;
    feed.requiredKg += row.requiredKg;
    feed.unmetKg += row.unmetKg;
    feed.purchasedKg += row.purchasedKg ?? 0;
    feed.hayKg += row.hayKg;
    feed.cells++;
    if (row.unmetKg > 0.01 * row.requiredKg) feed.shortCells++;
  }
  const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r0(v)]));
  return { species: Object.fromEntries(Object.entries(species).map(([k, v]) => [k, round(v)])), feed: round(feed) };
}
const snapshots = [];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  snapshots.push({ month, calendarMonth: getSimulationMonth(), ...snapshot() });
  writeFileSync(output, JSON.stringify({ input, settings, snapshots }));
  console.log(`[herdfeed] ${input} month ${month}`);
}
process.exit(0);
