import { readFileSync } from "node:fs";
const R = "/Users/h-yamaguchi/Projects/fmg-2";
const { createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { getMarkets } = await import(`${R}/src/extensions/economy/economyContext`);
const { getMarketCellColumn } = await import(`${R}/src/extensions/economy/economyContext`);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
const w: any = host.world; const col = getMarketCellColumn(); let rural = 0, inMarket = 0;
for (const c of w.pack.cells.i) { rural += w.pack.cells.pop[c] ?? 0; if (col[c]) inMarket += w.pack.cells.pop[c] ?? 0; }
let urban = 0; for (const b of w.pack.burgs) if (b?.i && !b.removed) urban += b.population ?? 0;
console.log(JSON.stringify({ rural: Math.round(rural), ruralInMarkets: Math.round(inMarket), urban: Math.round(urban), markets: getMarkets().length, populationRate: w.options?.populationRate ?? w.populationRate, urbanization: w.options?.urbanization }));
host.dispose();
