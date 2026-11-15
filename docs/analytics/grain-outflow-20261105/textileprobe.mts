/**
 * Why garments fall after the purchase fix (urban-craft-staffing.md §10.12). Read-only. Per month, all
 * markets summed: garment need / supplied / budget and stock gaps (urban, rural), household wealth
 * (urban, rural), staple grain price and the garment and grain market rows.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/grain-outflow-20261105/textileprobe.mts <map.fmg> <out.json> [months=24]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getHouseholdWealth } from "../../../src/extensions/economy/generators/burgMarketLedgers";
import { getRuralHouseholdWealth } from "../../../src/extensions/economy/generators/householdWealth";

const [input, output, monthsArg = "24"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
{
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-caravan-raids": "off" };
}
const r0 = (v: number) => Math.round(v ?? 0);
const NAMES = ["Garments", "Cloth", "Wool", "Beer", "Barley", "Wheat", "Oats", "Rye", "Grain"];
const snapshots: unknown[] = [];
for (let month = 1; month <= Number(monthsArg); month++) {
  await advanceWorld(host, { months: 1 });
  const goods = getGoods();
  const ids = new Map(NAMES.map(n => [n, goods.find(g => g.name === n)?.i]));
  const t: Record<string, number> = {};
  const add = (k: string, v: number) => (t[k] = (t[k] ?? 0) + (Number.isFinite(v) ? v : 0));
  for (const m of getMarkets()) {
    for (const b of (m as any).textileLedger?.settlementDiagnostics?.buyers ?? []) {
      const side = b.rural ? "rural" : "urban";
      add(`${side}Need`, b.need);
      add(`${side}Supplied`, b.supplied);
      add(`${side}Paid`, b.marketPaid);
      add(`${side}BudgetGap`, b.budgetGap);
      add(`${side}StockGap`, b.stockGap);
    }
    add("ruralWealth", getRuralHouseholdWealth(m));
    for (const [n, i] of ids)
      if (i != null && m.goods[i]) {
        add(`${n}Stock`, m.goods[i].stock);
        add(`${n}PriceSum`, m.goods[i].price);
        add(`${n}Markets`, 1);
      }
  }
  for (const b of getWorldContext().pack.burgs as any[]) if (b?.i && !b.removed) add("urbanWealth", getHouseholdWealth(b.i));
  snapshots.push({ month, ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, k.endsWith("PriceSum") ? Math.round(v * 100) / 100 : r0(v)])) });
  process.stderr.write(`[textile] month ${month}\n`);
}
writeFileSync(output, JSON.stringify({ input, snapshots }));
host.dispose();
