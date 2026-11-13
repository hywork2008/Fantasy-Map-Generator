/**
 * Per-market staple import, exportable surplus and brewing grain at month 0 and 1
 * (docs/plan/urban-craft-staffing.md §10.9). Read-only.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/economy-start-brewgrain-20261104/importprobe.mts <map.fmg> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getAleDemandSnapshot } from "../../../src/extensions/economy/generators/foodProcessingLedger";

const [input, output] = process.argv.slice(2);
const r0 = (v: number) => Math.round(v);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();

function snapshot(month: number) {
  const beer = getGoods().find(g => g.name === "Beer");
  return getMarkets().map(market => {
    const l = market.foodLedger;
    return {
      i: market.i,
      aleGrainMonth: r0(getAleDemandSnapshot(market).monthlyDemand),
      stock: r0((l?.foodStockAge0 ?? 0) + (l?.foodStockAge1 ?? 0) + (l?.foodStockAge2 ?? 0) + (l?.foodStockAge3 ?? 0)),
      exportable: r0(l?.exportable ?? 0),
      importNeed: r0(l?.importNeed ?? 0),
      satisfiedImport: r0(l?.satisfiedImport ?? 0),
      beerStock: r0(beer ? (market.goods[beer.i]?.stock ?? 0) : 0)
    };
  });
}
const snapshots = [{ month: 0, markets: snapshot(0) }];
await advanceWorld(host, { months: 1 });
snapshots.push({ month: 1, markets: snapshot(1) });
writeFileSync(output, JSON.stringify({ input, snapshots }, null, 1));
