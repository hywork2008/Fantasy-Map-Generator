/**
 * Does the market buy all the harvest the farms offer, and how much brewable grain does it hold?
 * (docs/plan/urban-craft-staffing.md §12 item 15). Read-only.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/beer-shortfall-20261104/harvestprobe.mts <map.fmg> <out.json> [months=18]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getAleDemandSnapshot } from "../../../src/extensions/economy/generators/foodProcessingLedger";

const [input, output, monthsArg = "18"] = process.argv.slice(2);
const r0 = (v: number) => Math.round(v ?? 0);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
const BREWABLE = new Set(["Barley", "Wheat", "Rye", "Oats"]);

function snapshot() {
  const goods = new Map(getGoods().map(g => [g.i, g.name]));
  return getMarkets().map(market => {
    const l = market.foodLedger as any;
    const crops: Record<string, number> = {};
    for (const [id, inv] of Object.entries(l?.stapleCropInventories ?? {}) as [string, any][]) {
      const stored = (inv.age0 ?? 0) + (inv.age1 ?? 0) + (inv.age2 ?? 0) + (inv.age3 ?? 0);
      crops[goods.get(Number(id)) ?? id] = r0(stored);
    }
    const brewable = Object.entries(crops).filter(([n]) => BREWABLE.has(n)).reduce((t, [, v]) => t + v, 0);
    const total = Object.values(crops).reduce((t, v) => t + v, 0);
    return {
      i: market.i,
      ale: r0(getAleDemandSnapshot(market).monthlyDemand),
      foodProduced: r0(l?.foodProduced),
      offered: (l?.offeredIntakeByMonth ?? []).map(r0),
      unsold: r0(l?.unsoldHarvest),
      urbanNeed: r0(l?.urbanNeed),
      ruralNeed: r0(l?.ruralNeed),
      exportable: r0(l?.exportable),
      exportReserve: r0(l?.exportReserve),
      brewingReserve: r0(l?.brewingReserve),
      satisfiedImport: r0(l?.satisfiedImport),
      overflow: r0(l?.storageOverflow),
      crops,
      brewableShare: total > 0 ? Math.round((brewable / total) * 100) / 100 : 0
    };
  });
}
const snapshots: unknown[] = [];
for (let month = 1; month <= Number(monthsArg); month++) {
  await advanceWorld(host, { months: 1 });
  snapshots.push({ month, markets: snapshot() });
  process.stderr.write(`[harvestprobe] month ${month}\n`);
}
writeFileSync(output, JSON.stringify({ input, snapshots }));
host.dispose();
