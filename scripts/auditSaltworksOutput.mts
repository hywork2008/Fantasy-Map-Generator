/**
 * Saltworks output against what limits it (docs/plan/salt-supply-calibration.md Q0): per month, the
 * works' capacity and output by method, works whose owner has no cash or whose market has no Wood, the
 * Wood at the works' markets in bags of salt it could boil, and the markets' free cash for salt.
 * Usage: auditSaltworksOutput.mts <archive.fmg> [months]
 */
import { readFileSync } from "node:fs";
import { getSaltworks } from "../src/extensions/economy/context/industry";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { saltMarketCash, saltOwnerCash, saltPayable } from "../src/extensions/economy/generators/saltFinance";
import { WOOD_KG_PER_LOT } from "../src/extensions/economy/generators/woodRecipeContracts";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "./lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
  applyConflictAutonomyFromEnv();
const months = Number(process.argv[3] ?? 12);
for (let m = 1; m <= months; m++) {
  await advanceWorld(host, { months: 1 });
  const w = getSaltworks(); const wood = getGoods().find(g => g.name === "Wood");
  const by: Record<string, { n: number; cap: number; out: number; cash0: number; fuel0: number }> = {};
  for (const o of w) {
    const r = (by[o.productionMethod ?? "?"] ??= { n: 0, cap: 0, out: 0, cash0: 0, fuel0: 0 });
    r.n++; r.cap += o.monthlyCapacityBags ?? 0; r.out += o.monthlyOutputBags;
    if (saltOwnerCash(o) < 1) r.cash0++;
    const fuel = wood && getMarkets().find(x => x.i === o.marketId)?.goods[wood.i];
    if (o.productionMethod === "boiling" && (fuel?.stock ?? 0) < 1) r.fuel0++;
  }
  const fuelPerBag = (60 * 60) / 34.5 / WOOD_KG_PER_LOT;
  const mk = new Set(w.map(o => o.marketId));
  const fuelBags = [...mk].reduce((s, id) => s + Math.max(0, getMarkets().find(x => x.i === id)?.goods[wood!.i]?.stock ?? 0) / fuelPerBag, 0);
  const cash = getMarkets().reduce((s, x) => s + saltMarketCash(x, new Map()), 0);
  const woodPrice = [...mk].map(id => getMarkets().find(x => x.i === id)?.goods[wood!.i]?.price ?? 0);
  console.log(m, "fuelBagsAtWorksMarkets", Math.round(fuelBags), "marketsSaltCash", Math.round(cash), "woodPriceAvg", (woodPrice.reduce((a, b) => a + b, 0) / woodPrice.length).toFixed(2));
  const payable = getMarkets().reduce((s, x) => s + saltPayable(x), 0);
  const ownerCash = w.reduce((s, o) => s + saltOwnerCash(o), 0);
  console.log(m, "active", w.filter(o => o.active).length, "saltPayable", Math.round(payable), "ownerCashSum", Math.round(ownerCash));
  console.log(m, JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { n: v.n, cap: Math.round(v.cap), out: Math.round(v.out), ownerCash0: v.cash0, fuel0: v.fuel0 }]))));
}
host.dispose();
