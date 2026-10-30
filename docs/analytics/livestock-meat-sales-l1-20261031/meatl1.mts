/** Monthly livestock salt need and unmet, rural purses, market cash and rural payables, world totals. */
import { readFileSync } from "node:fs";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getStateSaltLedgers } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/industry";
import { getGoods } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { setGoodFlowObserver } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/goodsBalanceLedger";
import { getHouseholdWealth } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/burgMarketLedgers";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const watch = ["Meat"];
let sinks: Record<string, number> = {}; let src: Record<string, number> = {};
setGoodFlowObserver(f => { const g = getGoods().find(x => x.i === f.goodId); if (!g || !watch.includes(g.name)) return; const t = f.direction === "sink" ? sinks : src; const k = `${g.name}:${f.category}${f.burgId ? ":town" : ":home"}`; t[k] = Math.round((t[k] ?? 0) + f.units); });
for (let m = 1; m <= Number(process.argv[3] ?? 24); m++) {
  sinks = {}; src = {};
  await advanceWorld(host, { months: 1 });
  const stock = Object.fromEntries(watch.map(n => { const g = getGoods().find(x => x.name === n); return [n, Math.round(getMarkets().reduce((a, x) => a + (g ? x.goods[g.i]?.stock ?? 0 : 0), 0))]; }));
  const led = getStateSaltLedgers() as any[]; const mk = getMarkets();
  const sum = (f: (x: any) => number) => Math.round(mk.reduce((a, x) => a + (f(x) || 0), 0));
  console.log(JSON.stringify({ month: m, livestockDemand: Math.round(led.reduce((a, l) => a + (l.monthlyLivestockDemandBags ?? 0), 0)), unmetLivestock: Math.round(led.reduce((a, l) => a + (l.monthlyUnmetLivestockBags ?? 0), 0)), unmetHousehold: Math.round(led.reduce((a, l) => a + (l.monthlyUnmetHouseholdBags ?? 0), 0)), ruralPurse: sum(x => x.foodLedger?.ruralHouseholdWealth), treasury: sum(x => x.marketTreasury?.balance), ruralPayable: sum(x => x.marketTreasury?.ruralGrainPayable), saltReceivable: sum(x => x.marketTreasury?.ruralSaltReceivable), src, sinks, urbanPurse: Math.round(getWorldContext().pack.burgs.reduce((a: number, b: any) => a + (b?.i && !b.removed ? getHouseholdWealth(b.i) : 0), 0)) }));
}
host.dispose();
