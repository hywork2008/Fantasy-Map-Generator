/**
 * Feed ledger by cell (docs/analytics/herd-feed-20261114.md §5): each month, every cell's livestock feed
 * ledger fields (kg) and its managed herd heads and supported herd, as columns. Market
 * settings come from the JSON in FMG_SETTINGS. Barilla is seeded as in barillaflow.mts.
 *
 *   npx tsx docs/analytics/herd-feed-20261114/cellfeed.mts <map.fmg> <out.json> <months>
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
const FIELDS = ["requiredKg", "unmetKg", "pastureGrownKg", "grazingReservedKg", "pastureConsumedKg", "hayConsumedKg", "cropResidueFeedKg", "hayKg", "harvestedKg", "harvestLossKg", "storageLossKg", "unharvestedKg", "soldKg", "purchasedKg"] as const;
const r0 = (v: number) => Math.round(v);
const snapshots = [];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const feed = getOrCreateLivestockFeedTable() ?? {};
  const stock = getFaunaStockTable() ?? {};
  const cells: Record<string, number[]> = {};
  for (const [cell, row] of Object.entries(feed)) {
    if (!row || !(row.requiredKg > 0)) continue;
    let heads = 0;
    let capacity = 0;
    for (const good of herds) {
      const c = stock[`${cell}:${good.name}`];
      if (!c) continue;
      heads += c.young + c.breeding + c.old;
      capacity += getDomesticatedCarryingCapacity(Number(cell), good, 0);
    }
    cells[cell] = [...FIELDS.map(f => r0((row as Record<string, number>)[f] ?? 0)), r0(heads), r0(capacity)];
  }
  snapshots.push({ month, calendarMonth: getSimulationMonth(), cells });
  writeFileSync(output, JSON.stringify({ input, settings, fields: [...FIELDS, "heads", "capacity"], snapshots }));
  console.log(`[cellfeed] ${input} month ${month}`);
}
process.exit(0);
