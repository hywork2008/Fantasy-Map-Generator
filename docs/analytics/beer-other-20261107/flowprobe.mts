/**
 * Where the Beer that town households drink comes from (docs/analytics/beer-other-20261107.md).
 * Read-only: tallies every recorded Beer flow (goodsBalanceLedger observer) by direction and
 * category, world-wide, per month, beside the Beer production records the beer probe counts,
 * the ale drunk (food processing ledger) and the market stock.
 *
 *   FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off npx tsx docs/analytics/beer-other-20261107/flowprobe.mts <map.fmg> <out.json> [months=8]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getBurgProductionRecords, getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";

const [input, output, monthsArg = "8"] = process.argv.slice(2);
const r0 = (v: number) => Math.round(v ?? 0);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
if (process.env.FMG_CARAVAN_RAIDS === "off") {
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-caravan-raids": "off" };
}

const beer = getGoods().find(g => g.name === "Beer")!;
let flows: Record<string, number> = {};
setGoodFlowObserver(flow => {
  if (flow.goodId !== beer.i) return;
  const key = `${flow.direction}:${flow.category}`;
  flows[key] = (flows[key] ?? 0) + flow.units;
});
const drunkTotal = () =>
  getMarkets().reduce(
    (t, m) => t + ((m as { foodProcessingLedger?: { Beer?: { householdConsumption?: number } } }).foodProcessingLedger?.Beer?.householdConsumption ?? 0),
    0
  );
const stock = () => getMarkets().reduce((t, m) => t + (m.goods[beer.i]?.stock ?? 0), 0);

const rows: unknown[] = [];
let drunkBefore = drunkTotal();
for (let month = 1; month <= Number(monthsArg); month++) {
  const stockBefore = stock();
  await advanceWorld(host, { months: 1 });
  const world = getWorldContext();
  let records = 0;
  for (const b of (world.pack.burgs as { i: number; removed?: boolean }[]).filter(b => b?.i && !b.removed))
    for (const record of getBurgProductionRecords(b as never) as { goodId?: number; units?: number; dealId?: number }[])
      if (!("dealId" in record) && record.goodId === beer.i) records += record.units ?? 0;
  const drunk = drunkTotal();
  const row = {
    month,
    stockBefore: r0(stockBefore),
    stockAfter: r0(stock()),
    productionRecords: r0(records),
    drunk: r0(drunk - drunkBefore),
    flows: Object.fromEntries(Object.entries(flows).map(([k, v]) => [k, r0(v)]))
  };
  console.log(JSON.stringify(row));
  rows.push(row);
  drunkBefore = drunk;
  flows = {};
}
writeFileSync(output, JSON.stringify({ input, rows }));
process.exit(0);
