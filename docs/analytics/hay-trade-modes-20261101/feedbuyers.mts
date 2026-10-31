/**
 * Who buys Fodder each month: per month, cells' purchases split by whether the cell sold hay in the
 * past 12 months, whether its own pasture ever exceeds its need, and whether the purchase covered this
 * month's feeding (hayConsumed) or only topped up its reserve. Usage: feedbuyers.mts <archive> <out.jsonl> [months]
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const R = "/Users/h-yamaguchi/Projects/fmg-2";
const { getOrCreateLivestockFeedTable } = await import(`${R}/src/extensions/economy/context/cellTables`);
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const [input, output, length = "24"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
writeFileSync(output, "");
for (let m = 1; m <= Number(length); m++) {
  await advanceWorld(host, { months: 1 });
  if (m <= 12) { console.log("month", m); continue; }
  const table = getOrCreateLivestockFeedTable() as any[];
  const out: Record<string, number> = { month: m };
  const add = (k: string, v: number) => { out[k] = (out[k] ?? 0) + v; };
  for (const row of Object.values(table ?? {}) as any[]) {
    if (!row || !(row.purchasedKg > 0)) continue;
    const seller = (row.samples ?? []).some((s: any) => s.soldKg > 0) || row.soldKg > 0;
    const k = seller ? "seller" : "nonSeller";
    add(`${k}Kg`, row.purchasedKg);
    add(`${k}Money`, row.spending);
    add(`${k}Cells`, 1);
    const gap = Math.max(0, row.requiredKg - row.pastureConsumedKg - (row.cropResidueFeedKg ?? 0));
    add(`${k}FedNowKg`, Math.min(row.purchasedKg, gap));
    add(`${k}HayAfterKg`, row.hayKg);
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  appendFileSync(output, `${JSON.stringify(out)}\n`);
  console.log("month", m);
}
host.dispose();
