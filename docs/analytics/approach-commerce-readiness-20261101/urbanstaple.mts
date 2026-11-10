import { readFileSync } from "node:fs";
const R = process.env.ROOT ?? "/Users/h-yamaguchi/Projects/fmg-2";
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const { getGoods, getMarkets, getApproachTraffic } = await import(`${R}/src/extensions/economy/economyContext`);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(`${R}/tests/fixtures/sim-golden.fmg`)));
await host.prepare(); applyConflictAutonomyFromEnv();
const staple = getGoods().find((g: any) => g.tags.includes("stapleFood"))!;
let need = 0, sup = 0, bgap = 0, sgap = 0; const per: Record<number, number[]> = {};
for (let m = 0; m < 12; m++) {
  await advanceWorld(host, { months: 1 });
  for (const x of getMarkets() as any[]) { const o = x.foodLedger?.monthlyConsumption; if (o) { need += o.urbanNeed ?? 0; sup += o.urbanSupplied ?? 0; bgap += o.urbanBudgetGap ?? 0; sgap += o.urbanStockGap ?? 0; const p = (per[x.i] ??= [0, 0, 0, 0, 0]); p[0] += o.urbanNeed; p[1] += o.urbanSupplied; p[2] += o.urbanBudgetGap; p[3] += o.urbanStockGap; p[4] = x.foodLedger.ruralHouseholdWealth; } }
}
let inbound = 0; for (const r of getApproachTraffic() as any[]) inbound += r.goodsSlots?.[staple.i] ?? 0;
const w: any = host.world; let people = 0; for (const b of w.pack.burgs) if (b?.i && !b.removed) people += (b.population ?? 0);
console.log(JSON.stringify({ urbanNeed: Math.round(need), urbanSupplied: Math.round(sup), gateStapleUnits: Math.round(inbound / 3.1318), burgPopPoints: Math.round(people), budgetGap: Math.round(bgap), stockGap: Math.round(sgap), perMarket: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v.map(Math.round)])) }));
host.dispose();
