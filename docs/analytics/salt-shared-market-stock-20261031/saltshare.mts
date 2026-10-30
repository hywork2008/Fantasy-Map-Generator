/** Per market: how its people split across states (largest state's share), vs the salt audit price. */
import { readFileSync } from "node:fs";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getMarketCellColumn } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/cellTables";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
const w = getWorldContext(); const col = getMarketCellColumn();
const by: Record<number, Record<number, number>> = {};
for (const c of w.pack.cells.i) { if (w.pack.cells.h[c] < 20) continue; const m = col[c]; if (!m) continue; const s = w.pack.cells.state[c]; (by[m] ??= {})[s] = (by[m][s] ?? 0) + w.pack.cells.pop[c]; }
const audit = JSON.parse(readFileSync(process.argv[3], "utf8"));
const rows = audit.rows.slice(-12);
const out = getMarkets().map(m => { const st = by[m.i] ?? {}; const tot = Object.values(st).reduce((a, b) => a + b, 0); const top = Math.max(0, ...Object.values(st)); const ratios = rows.map((r: any) => r.markets[m.i]).filter(Boolean).map((x: any) => x.price / x.reference); return { market: m.i, states: Object.keys(st).length, topShare: tot ? +(top / tot).toFixed(2) : 1, pop: Math.round(tot), priceToRef: ratios.length ? +(ratios.reduce((a: number, b: number) => a + b, 0) / ratios.length).toFixed(2) : null }; });
console.log(JSON.stringify(out));
host.dispose();
