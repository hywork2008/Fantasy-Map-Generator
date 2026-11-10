/**
 * Where surplus hay comes from: per Market and month, the temporary __diagCut accumulator (diag patch
 * in livestockFeed.ts harvestLivestockForage) and the feed ledger sums (need, pasture, crop residue,
 * hay eaten, unmet, bought, sold, barn stock).
 * Usage: haysurplus.mts <archive.fmg> <output.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getMarketCellColumn, getOrCreateLivestockFeedTable } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/cellTables";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";

const [input, output, length = "36"] = process.argv.slice(2);
const months = Number(length);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
const g = globalThis as any;
const rows: unknown[] = [];
const FIELDS = ["requiredKg", "pastureConsumedKg", "cropResidueFeedKg", "hayConsumedKg", "unmetKg", "purchasedKg", "soldKg", "hayKg"] as const;
for (let m = 1; m <= months; m++) {
  g.__diagCut = {};
  await advanceWorld(host, { months: 1 });
  const column = getMarketCellColumn();
  const table = getOrCreateLivestockFeedTable() ?? {};
  const feed: Record<number, Record<string, number>> = {};
  for (const [cell, row] of Object.entries(table) as [string, any][]) {
    const f = (feed[column[Number(cell)]] ??= {});
    for (const k of FIELDS) f[k] = (f[k] ?? 0) + (row[k] ?? 0);
  }
  rows.push({ month: m, cut: g.__diagCut, feed });
  writeFileSync(output, JSON.stringify({ months: m, rows }));
  console.log("month", m);
}
host.dispose();
