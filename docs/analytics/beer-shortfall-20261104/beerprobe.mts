/**
 * Why Beer falls short of ale demand (docs/plan/urban-craft-staffing.md §12 item 15). Read-only.
 * Per market and month: ale demand, Beer made / drunk / unmet, Beer and Barrels stock and price,
 * brewing grain rows, the food ledger's exportable / brewing reserve, and the worker-loop
 * diagnostics for Beer and Barrels (planning and execution guards).
 *
 *   FMG_CONFLICT_AUTONOMY=peace [FMG_CARAVAN_RAIDS=off] npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts <map.fmg> <out.json> [months=60]
 *
 * FMG_CARAVAN_RAIDS=off removes the only randomness, so two runs of one map and code agree.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getBurgProductionRecords, getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getCraftDomainEmploymentRecords } from "../../../src/extensions/economy/context/knowledge";
import { getAleDemandSnapshot } from "../../../src/extensions/economy/generators/foodProcessingLedger";
import { aggregateProductionDiagnostics } from "../../../src/extensions/economy/generators/productionDiagnostics";
import { getUrbanCraftCapacityRecords } from "../../../src/extensions/economy/generators/urbanCraftCapacity";

const [input, output, monthsArg = "60"] = process.argv.slice(2);
const months = Number(monthsArg);
const r2 = (v: number) => Math.round(v * 100) / 100;
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
if (process.env.FMG_CARAVAN_RAIDS === "off") {
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-caravan-raids": "off" };
}

const GRAINS = ["Barley", "Wheat", "Rye", "Oats"];
const TRACKED = ["Beer", "Barrels"];

function snapshot(month: number) {
  const world = getWorldContext();
  const rate = Math.max(1, world.populationRate ?? 1);
  const goods = getGoods();
  const byName = new Map(goods.map(g => [g.name, g]));
  const beer = byName.get("Beer")!;
  const barrels = byName.get("Barrels")!;
  const trackedIds = new Map(TRACKED.map(n => [byName.get(n)!.i, n]));
  const live = (world.pack.burgs as any[]).filter(b => b?.i && !b.removed);

  const made = new Map<number, Record<string, number>>();
  const brewers = new Map<number, { burgs: number; producing: number }>();
  for (const b of live) {
    const row = made.get(b.market) ?? {};
    let beerHere = 0;
    for (const record of getBurgProductionRecords(b) as any[]) {
      if ("dealId" in record) continue;
      const name = trackedIds.get(record.goodId);
      if (name) row[name] = (row[name] ?? 0) + record.units;
      if (record.goodId === beer.i) beerHere += record.units;
    }
    made.set(b.market, row);
    const s = brewers.get(b.market) ?? { burgs: 0, producing: 0 };
    s.burgs++;
    if (beerHere > 0) s.producing++;
    brewers.set(b.market, s);
  }
  const workers = new Map<string, number>();
  for (const r of getCraftDomainEmploymentRecords() as any[]) {
    if (r.domain !== "brewing" && r.domain !== "woodworking") continue;
    const m = world.pack.burgs[r.burgId]?.market;
    const key = `${m}:${r.domain}`;
    workers.set(key, (workers.get(key) ?? 0) + r.workers * rate);
  }
  const diag = new Map(aggregateProductionDiagnostics(getUrbanCraftCapacityRecords()).map(d => [d.marketId, d]));

  return getMarkets().map(market => {
    const ale = getAleDemandSnapshot(market);
    const ledger = market.foodLedger as any;
    const beerLedger = (market as any).foodProcessingLedger?.Beer ?? (market as any).foodProcessing?.Beer;
    const d = diag.get(market.i);
    const diagnostics: Record<string, Record<string, number>> = {};
    for (const row of d?.rows ?? []) {
      const name = row.goodId === null ? "loop" : trackedIds.get(row.goodId);
      if (!name) continue;
      const key = `${row.stage}:${row.constraints.join("+") || "chosen"}`;
      diagnostics[name] ??= {};
      diagnostics[name][key] = (diagnostics[name][key] ?? 0) + row.count;
      if (row.outputLots) diagnostics[name][`${row.stage}:outputLots`] = r2((diagnostics[name][`${row.stage}:outputLots`] ?? 0) + row.outputLots);
    }
    const g = (good: any) => ({ stock: r2(market.goods[good.i]?.stock ?? 0), price: r2(market.goods[good.i]?.price ?? 0) });
    return {
      i: market.i,
      aleDemand: r2(ale.monthlyDemand),
      aleBaseline: r2(ale.baselineDemand),
      beerLedger: beerLedger && {
        intake: r2(beerLedger.marketIntake),
        drunk: r2(beerLedger.householdConsumption),
        unmet: r2(beerLedger.unmetDemand),
        exported: r2(beerLedger.deliveredExport)
      },
      made: Object.fromEntries(Object.entries(made.get(market.i) ?? {}).map(([k, v]) => [k, r2(v)])),
      brewers: brewers.get(market.i),
      brewingPeople: Math.round(workers.get(`${market.i}:brewing`) ?? 0),
      woodPeople: Math.round(workers.get(`${market.i}:woodworking`) ?? 0),
      beer: g(beer),
      barrels: g(barrels),
      grains: Object.fromEntries(GRAINS.map(n => [n, byName.get(n) ? g(byName.get(n)) : null])),
      food: ledger && {
        exportable: r2(ledger.exportable ?? 0),
        brewingReserve: r2(ledger.brewingReserve ?? 0),
        exportReserve: r2(ledger.exportReserve ?? 0),
        importNeed: r2(ledger.importNeed ?? 0)
      },
      caskInService: r2((market as any).returnableContainerLedger?.beerCasksInService ?? 0),
      labor: d && { burgs: d.burgs, workforce: r2(d.workforcePoints), charged: r2(d.chargedPoints), unused: r2(d.unusedPoints) },
      diagnostics
    };
  });
}

const result: { input: string; snapshots: unknown[] } = { input, snapshots: [] };
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  result.snapshots.push({ month, markets: snapshot(month) });
  process.stderr.write(`[beerprobe] ${input} month ${month}\n`);
  if (month % 6 === 0 || month === months) writeFileSync(output, JSON.stringify(result));
}
host.dispose();
