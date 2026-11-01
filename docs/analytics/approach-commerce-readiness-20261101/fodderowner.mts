import { readFileSync } from "node:fs";
const R = "/Users/h-yamaguchi/Projects/fmg-2";
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const { getGoods, getMarkets } = await import(`${R}/src/extensions/economy/economyContext`);
const { getRuralHouseholdWealth } = await import(`${R}/src/extensions/economy/generators/householdWealth`);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const f = getGoods().find((g: any) => g.name === "Fodder")!;
for (let m = 1; m <= Number(process.argv[3] ?? 36); m++) {
  await advanceWorld(host, { months: 1 });
  const ms = getMarkets() as any[];
  const sum = (fn: (x: any) => number) => Math.round(ms.reduce((t, x) => t + (fn(x) || 0), 0));
  console.log(JSON.stringify({ m, stock: sum(x => x.goods[f.i]?.stock), consigned: sum(x => x.marketTreasury?.ruralHayConsignedLots), legacy: sum(x => x.marketTreasury?.ruralHayPayable), treasury: sum(x => x.marketTreasury?.balance), rural: sum(x => getRuralHouseholdWealth(x)) }));
}
host.dispose();
