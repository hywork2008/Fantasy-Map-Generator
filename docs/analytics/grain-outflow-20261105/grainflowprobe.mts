/**
 * Where a market's staple grain goes each month (docs/plan/urban-craft-staffing.md §10.12, item 19).
 * Read-only: counts every draw on the market granary through setStapleCropDrawObserver, and the
 * food ledger's own monthly consumption, spoilage and purchase fields.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/grain-outflow-20261105/grainflowprobe.mts <map.fmg> <out.json> [months=24]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";
import { setStapleCropDrawObserver } from "../../../src/extensions/economy/generators/stapleCropInventory";

const [input, output, monthsArg = "24"] = process.argv.slice(2);
const r0 = (v: number) => Math.round(v ?? 0);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
{
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-caravan-raids": "off" };
}
Error.stackTraceLimit = 40;

const CALLERS = [
  ["marketPurchases", "recipe"],
  ["millCapacity", "mill"],
  ["playerCommerce", "player"],
  ["foodImportNetwork", "export"],
  ["caravans", "caravan"],
  ["newMarketProvisions", "newMarket"],
  ["marketDissolution", "dissolution"],
  ["foodLedgerConsumption", "eaten"]
] as const;
let byMarket = new Map<number, Record<string, number>>();
const ledgerMarket = new Map<object, number>();
setStapleCropDrawObserver((ledger, kind, units) => {
  if (!ledgerMarket.has(ledger)) for (const m of getMarkets()) if (m.foodLedger) ledgerMarket.set(m.foodLedger, m.i);
  const marketId = ledgerMarket.get(ledger) ?? -1;
  const stack = new Error().stack ?? "";
  const caller = CALLERS.find(([file]) => stack.includes(`${file}.ts`))?.[1] ?? "other";
  const row = byMarket.get(marketId) ?? {};
  const key = `${kind}:${caller}`;
  row[key] = (row[key] ?? 0) + units;
  byMarket.set(marketId, row);
});

// Recipe purchases of staple crops, by the good they are made into.
const cropIds = new Set(getGoods().filter(g => g.crop).map(g => g.i));
const goodName = new Map(getGoods().map(g => [g.i, g.name]));
let recipeByMarket = new Map<number, Record<string, number>>();
setGoodFlowObserver(flow => {
  if (flow.category !== "recipeInput" || !cropIds.has(flow.goodId) || flow.marketId == null) return;
  const row = recipeByMarket.get(flow.marketId) ?? {};
  const key = goodName.get(flow.relatedGoodId ?? -1) ?? "unknown";
  row[key] = (row[key] ?? 0) + flow.units;
  recipeByMarket.set(flow.marketId, row);
});

function stock(l: any): number {
  let t = 0;
  for (const inv of Object.values(l?.stapleCropInventories ?? {}) as any[])
    t += (inv.age0 ?? 0) + (inv.age1 ?? 0) + (inv.age2 ?? 0) + (inv.age3 ?? 0) + (inv.overflow ?? 0);
  return t;
}
const snapshots: unknown[] = [];
let previous = new Map(getMarkets().map(m => [m.i, stock(m.foodLedger)]));
for (let month = 1; month <= Number(monthsArg); month++) {
  byMarket = new Map();
  recipeByMarket = new Map();
  ledgerMarket.clear();
  await advanceWorld(host, { months: 1 });
  const markets = getMarkets().map(m => {
    const l = m.foodLedger as any;
    const c = l?.monthlyConsumption ?? {};
    const now = stock(l);
    const row = {
      i: m.i,
      stockBefore: r0(previous.get(m.i) ?? 0),
      stockAfter: r0(now),
      bought: r0(l?.foodProduced),
      imported: r0(l?.satisfiedImport),
      spoiledQuarter: r0(l?.storageSpoiled),
      overflow: r0(l?.storageOverflow),
      unsold: r0(l?.unsoldHarvest),
      urbanFromMarket: r0(c.urbanSupplied),
      ruralFromMarket: r0(c.ruralFromMarket),
      lodger: r0(c.lodgerSupplied),
      recipes: Object.fromEntries(Object.entries(recipeByMarket.get(m.i) ?? {}).map(([k, v]) => [k, r0(v)])),
      draws: Object.fromEntries(Object.entries(byMarket.get(m.i) ?? {}).map(([k, v]) => [k, r0(v)]))
    };
    previous.set(m.i, now);
    return row;
  });
  snapshots.push({ month, markets });
  process.stderr.write(`[grainflow] month ${month}\n`);
}
writeFileSync(output, JSON.stringify({ input, snapshots }));
host.dispose();
