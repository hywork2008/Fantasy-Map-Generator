/** Last two years of an 84-month run: per state livestock salt need and unmet; per market rural purse, towns' people, meat sold. */
import { readFileSync } from "node:fs";
import { getMarkets, getGoods } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getStateSaltLedgers } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/industry";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { setGoodFlowObserver } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/goodsBalanceLedger";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const months = Number(process.argv[3] ?? 84), from = months - 24;
const states: Record<number, { need: number; unmet: number }> = {};
const markets: Record<number, { purse: number; meatSold: number; meatMade: number; people: number }> = {};
let m = 0;
setGoodFlowObserver((f: any) => { if (m <= from || f.marketId === undefined) return; const g = getGoods().find((x: any) => x.i === f.goodId); if (g?.name !== "Meat") return; const r = (markets[f.marketId] ??= { purse: 0, meatSold: 0, meatMade: 0, people: 0 }); if (f.direction === "source") r.meatMade += f.units; else if (f.burgId) r.meatSold += f.units; });
for (m = 1; m <= months; m++) {
  await advanceWorld(host, { months: 1 });
  if (m <= from) continue;
  for (const l of getStateSaltLedgers() as any[]) { const s = (states[l.stateId] ??= { need: 0, unmet: 0 }); s.need += l.monthlyLivestockDemandBags ?? 0; s.unmet += l.monthlyUnmetLivestockBags ?? 0; }
  for (const x of getMarkets() as any[]) { const r = (markets[x.i] ??= { purse: 0, meatSold: 0, meatMade: 0, people: 0 }); r.purse += (x.foodLedger?.ruralHouseholdWealth ?? 0) / 24; }
}
const w = getWorldContext(); const rate = Math.max(1, w.populationRate ?? 1);
for (const b of w.pack.burgs) if (b?.i && !b.removed && b.market) (markets[b.market] ??= { purse: 0, meatSold: 0, meatMade: 0, people: 0 }).people += (b.population ?? 0) * rate * Math.max(1, w.urbanization ?? 1);
const marketStates: Record<number, Record<number, number>> = {};
for (const i of w.pack.cells.i) { if (w.pack.cells.h[i] < 20) continue; const mk = (await import("/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/economyContext")).getMarketCellColumn()[i]; const s = w.pack.cells.state[i]; (marketStates[mk] ??= {})[s] = ((marketStates[mk] ??= {})[s] ?? 0) + w.pack.cells.pop[i] * rate; }
for (const [id, s] of Object.entries(states).sort((a, b) => b[1].unmet - a[1].unmet)) console.log(JSON.stringify({ state: +id, need: Math.round(s.need), unmet: Math.round(s.unmet), share: s.need ? +(s.unmet / s.need).toFixed(3) : 0 }));
for (const [id, r] of Object.entries(markets)) console.log(JSON.stringify({ market: +id, purse: Math.round(r.purse), townPeople: Math.round(r.people), meatMadeWains: Math.round(r.meatMade), meatSoldWains: Math.round(r.meatSold), ruralByState: Object.fromEntries(Object.entries(marketStates[+id] ?? {}).map(([k, v]) => [k, Math.round(v)])) }));
host.dispose();
