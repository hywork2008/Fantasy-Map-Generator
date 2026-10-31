/** Start-of-game provisioning probe: needed goods' market stock and price/value, housing, wealth spread, heat. */
import { readFileSync } from "node:fs";
import { getConstructionOperations } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/industry";
import { getBurgMarketLedgers, getGoods, getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getMarketCellColumn } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/cellTables";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const out: Record<string, unknown>[] = [];
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const gini = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const n = s.length; const t = s.reduce((x, y) => x + y, 0); if (!n || !t) return 0; let c = 0; s.forEach((v, i) => (c += (2 * (i + 1) - n - 1) * v)); return c / (n * t); };
const snap = (month: number) => {
  const goods = getGoods().filter(g => Object.keys(g.demandCoverage ?? {}).some(k => ["food", "clothing", "utilities", "construction"].includes(k)));
  const rows = goods.map(g => { let stock = 0, ratio = 0, n = 0, zero = 0; for (const m of getMarkets()) { const r = m.goods[g.i]; if (!r) { zero++; continue; } stock += r.stock; if (r.stock <= 0) zero++; ratio += (r.price ?? 0) / Math.max(1e-9, g.value); n++; } return { good: g.name, cov: Object.keys(g.demandCoverage ?? {}).join("+"), stock: Math.round(stock), priceToValue: +(ratio / Math.max(1, n)).toFixed(2), marketsEmpty: zero }; });
  const { pack } = getWorldContext();
  const ops = getConstructionOperations();
  const housing = ops.map(o => o.buildingStock ?? 0);
  const urbanPerHead = getBurgMarketLedgers().map(l => { const b = pack.burgs[l.burgId]; return (l.householdWealth ?? 0) / Math.max(1e-9, b?.population ?? 0); }).filter(Number.isFinite);
  const ruralPerHead = getMarkets().map(m => { let p = 0; for (const id of pack.cells.i) if (pack.cells.h[id] >= 20 && getMarketCellColumn()[id] === m.i) p += pack.cells.pop[id]; return (m.foodLedger?.ruralHouseholdWealth ?? 0) / Math.max(1e-9, p); });
  const heat = getMarkets().reduce((a, m) => ({ need: a.need + (m.heatingLedger?.heatingDemand ?? 0), unmet: a.unmet + (m.heatingLedger?.unmetHeating ?? 0) }), { need: 0, unmet: 0 });
  const cold = pack.burgs.filter((b: any) => b?.i && !b.removed).map((b: any) => b.coldExposure ?? 0);
  out.push({ month, goods: rows, housing: { burgs: housing.length, p10: pct(housing, 0.1), median: pct(housing, 0.5), p90: pct(housing, 0.9), mean: housing.reduce((a, b) => a + b, 0) / Math.max(1, housing.length) }, urbanWealthPerPoint: { p10: pct(urbanPerHead, 0.1), median: pct(urbanPerHead, 0.5), p90: pct(urbanPerHead, 0.9), gini: gini(urbanPerHead), zeroShare: urbanPerHead.filter(v => v <= 0.01).length / Math.max(1, urbanPerHead.length) }, ruralWealthPerPoint: { p10: pct(ruralPerHead, 0.1), median: pct(ruralPerHead, 0.5), p90: pct(ruralPerHead, 0.9), gini: gini(ruralPerHead) }, heating: { unmetShare: heat.need ? heat.unmet / heat.need : 0, burgsColdOver0_5: cold.filter((c: number) => c > 0.5).length, burgs: cold.length } });
};
snap(0);
for (let m = 1; m <= 12; m++) { await advanceWorld(host, { months: 1 }); if ([1, 3, 12].includes(m)) snap(m); }
console.log(JSON.stringify(out));
host.dispose();
