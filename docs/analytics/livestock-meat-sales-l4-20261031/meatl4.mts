/** L4 (docs/plan/livestock-meat-sales.md §4): monthly livestock salt, purses, meat, urban staple, world totals. ROOT=<repo> picks the code. */
import { readFileSync } from "node:fs";
const R = process.env.ROOT ?? "/Users/h-yamaguchi/Projects/fmg-2";
const { getMarkets, getGoods } = await import(`${R}/src/extensions/economy/context/trade`);
const { getStateSaltLedgers } = await import(`${R}/src/extensions/economy/context/industry`);
const { getWorldContext } = await import(`${R}/src/extensions/economy/context/economyApi`);
const { getHouseholdWealth } = await import(`${R}/src/extensions/economy/generators/burgMarketLedgers`);
const { setGoodFlowObserver } = await import(`${R}/src/extensions/economy/generators/goodsBalanceLedger`);
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
let town = 0, home = 0;
setGoodFlowObserver((f: any) => { if (f.direction !== "sink" || f.category !== "householdFood") return; const g = getGoods().find((x: any) => x.i === f.goodId); if (g?.name !== "Meat") return; if (f.burgId) town += f.units; else home += f.units; });
for (let m = 1; m <= Number(process.argv[3] ?? 84); m++) {
  town = 0; home = 0;
  await advanceWorld(host, { months: 1 });
  const w = getWorldContext(); const rate = Math.max(1, w.populationRate ?? 1); const urb = Math.max(1, w.urbanization ?? 1);
  const led = getStateSaltLedgers() as any[]; const mk = getMarkets() as any[];
  const sum = (f: (x: any) => number) => mk.reduce((a, x) => a + (f(x) || 0), 0);
  let urbanPeople = 0, urbanPurse = 0;
  for (const b of w.pack.burgs) if (b?.i && !b.removed) { urbanPeople += (b.population ?? 0) * rate * urb; urbanPurse += getHouseholdWealth(b.i); }
  const r = (v: number) => Math.round(v);
  console.log(JSON.stringify({ month: m, year: (host as any).simulation?.currentYear, livestockDemand: r(led.reduce((a, l) => a + (l.monthlyLivestockDemandBags ?? 0), 0)), unmetLivestock: r(led.reduce((a, l) => a + (l.monthlyUnmetLivestockBags ?? 0), 0)), unmetHousehold: r(led.reduce((a, l) => a + (l.monthlyUnmetHouseholdBags ?? 0), 0)), ruralPurse: r(sum(x => x.foodLedger?.ruralHouseholdWealth)), urbanPurse: r(urbanPurse), treasury: r(sum(x => x.marketTreasury?.balance)), saltReceivable: r(sum(x => x.marketTreasury?.ruralSaltReceivable)), urbanPeople: r(urbanPeople), meatTown: r(town), meatHome: r(home), meatDemand: r((urbanPeople * 25) / 12 / (200 / 0.43)), urbanNeed: r(sum(x => x.foodLedger?.monthlyConsumption?.urbanNeed)), urbanSupplied: r(sum(x => x.foodLedger?.monthlyConsumption?.urbanSupplied)), budgetGap: r(sum(x => x.foodLedger?.monthlyConsumption?.urbanBudgetGap)), ruralNeed: r(sum(x => x.foodLedger?.monthlyConsumption?.ruralNeed)) }));
}
host.dispose();
