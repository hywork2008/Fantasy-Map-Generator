import { readFileSync } from "node:fs";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getMarketCellColumn } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/cellTables";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
const w = getWorldContext(); const col = getMarketCellColumn();
const res: Record<number, Record<number, number>> = {};
for (const c of w.pack.cells.i) { if (w.pack.cells.h[c] < 20) continue; const m = col[c]; (res[m] ??= {})[w.pack.cells.state[c]] = Math.round(((res[m] ?? {})[w.pack.cells.state[c]] ?? 0) + w.pack.cells.pop[c]); }
for (const m of getMarkets()) { const r = res[m.i] ?? {}; const tot = Object.values(r).reduce((a, b) => a + b, 0); console.log("market", m.i, "neutralShare", ((r[0] ?? 0) / tot).toFixed(2), JSON.stringify(r)); }
host.dispose();
