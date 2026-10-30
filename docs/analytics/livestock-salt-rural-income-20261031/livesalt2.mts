/** Which limit holds back livestock salt each month, and where rural purse money comes from and goes. */
import { readFileSync } from "node:fs";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { setRuralHouseholdWealthFlowObserver } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/householdWealth";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
let flows: Record<string, number> = {};
setRuralHouseholdWealthFlowObserver((marketId, amount) => {
  const line = (new Error().stack ?? "").split("\n")[3] ?? "";
  const file = (line.match(/generators\/([A-Za-z]+)\.ts/)?.[1] ?? line.trim().slice(0, 40)) + (amount > 0 ? "+" : "-");
  flows[file] = (flows[file] ?? 0) + amount;
});
for (let m = 1; m <= Number(process.argv[3] ?? 24); m++) {
  (globalThis as any).__saltDiag = [];
  flows = {};
  await advanceWorld(host, { months: 1 });
  const rows: any[] = (globalThis as any).__saltDiag;
  const by = { stock: 0, money: 0, none: 0 }; let need = 0;
  const byMarket: Record<number, any> = {};
  for (const r of rows) {
    need += r.need;
    const got = Math.min(r.need, r.stockRoom, r.money);
    const short = r.need - got;
    if (short <= 1e-6) continue;
    const key = r.stockRoom <= r.money ? "stock" : "money";
    (by as any)[key] += short;
    const b = (byMarket[r.m] ??= { stock: 0, money: 0 }); b[key] += short;
  }
  const purse = Math.round(getMarkets().reduce((a, mk) => a + (mk.foodLedger?.ruralHouseholdWealth ?? 0), 0));
  const top = Object.entries(byMarket).map(([k, v]: any) => [k, Math.round(v.stock), Math.round(v.money)]).sort((a: any, b: any) => b[1] + b[2] - a[1] - a[2]).slice(0, 6);
  console.log(JSON.stringify({ month: m, need: Math.round(need), shortStock: Math.round(by.stock), shortMoney: Math.round(by.money), purse, flows: Object.fromEntries(Object.entries(flows).map(([k, v]) => [k, Math.round(v)])), top }));
}
host.dispose();
