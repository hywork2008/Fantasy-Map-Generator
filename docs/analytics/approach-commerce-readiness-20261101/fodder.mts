import { readFileSync } from "node:fs";
const R = process.env.ROOT ?? "/Users/h-yamaguchi/Projects/fmg-2";
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const { getGoods, getMarkets } = await import(`${R}/src/extensions/economy/economyContext`);
const { getOrCreateLivestockFeedTable: getLivestockFeedTable } = await import(`${R}/src/extensions/economy/context/cellTables`).catch(() => ({} as any));
const { getRuralHouseholdWealth } = await import(`${R}/src/extensions/economy/generators/householdWealth`);
const { setGoodFlowObserver } = await import(`${R}/src/extensions/economy/generators/goodsBalanceLedger`);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(`${R}/tests/fixtures/sim-golden.fmg`)));
await host.prepare(); applyConflictAutonomyFromEnv();
const f = getGoods().find((g: any) => g.name === "Fodder")!;
let flows: Record<string, number> = {};
setGoodFlowObserver((x: any) => { if (x.goodId === f.i) { const k = `${x.direction[0]}:${x.category}`; flows[k] = (flows[k] ?? 0) + x.units; } });
for (let m = 1; m <= 24; m++) {
  await advanceWorld(host, { months: 1 });
  const ms = getMarkets() as any[];
  console.log(JSON.stringify({ m, cal: host.simulation.currentMonth, stock: Math.round(ms.reduce((t, x) => t + (x.goods[f.i]?.stock ?? 0), 0)), price: ms.map(x => x.goods[f.i]?.price?.toFixed(2)).join("/"), use: Math.round(ms.reduce((t, x) => t + (x.foodLedger?.fodderAnnualUseLots ?? 0), 0)), feed: (() => { const t: any = (getLivestockFeedTable?.() ?? {}); let req = 0, unmet = 0; for (const r of Object.values(t) as any[]) { req += r.requiredKg ?? 0; unmet += r.unmetKg ?? 0; } return { req: Math.round(req / 1e6), unmet: Math.round(unmet / 1e6) }; })(), rural: Math.round(ms.reduce((t, x) => t + getRuralHouseholdWealth(x), 0)), payable: Math.round(ms.reduce((t, x) => t + (x.marketTreasury?.ruralHayPayable ?? 0), 0)), flows: Object.fromEntries(Object.entries(flows).map(([k, v]) => [k, Math.round(v)])) }));
  flows = {};
}
host.dispose();
