/** Market 1's salt stock vs need and inflow; and people/herds outside every market, counted unmet. */
import { readFileSync } from "node:fs";
import { getGoods, getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getSaltShipments, getSaltworks, getStateSaltLedgers } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/industry";
import { getMarketCellColumn } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/cellTables";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const months = Number(process.argv[3] ?? 36); const focus = Number(process.argv[4] ?? 1);
const out: unknown[] = [];
for (let m = 1; m <= months; m++) {
  await advanceWorld(host, { months: 1 });
  const salt = getGoods().find(g => g.name === "Salt")!;
  const mk = getMarkets().find(x => x.i === focus);
  const w = getWorldContext(); const col = getMarketCellColumn(); const ids = new Set(getMarkets().map(x => x.i));
  let outsidePeople = 0, insidePeople = 0;
  for (const c of w.pack.cells.i) { if (w.pack.cells.h[c] < 20 || !w.pack.cells.state[c]) continue; const p = w.pack.cells.pop[c] * (w.populationRate ?? 1); if (ids.has(col[c])) insidePeople += p; else outsidePeople += p; }
  let outsideBurgPeople = 0;
  for (const b of w.pack.burgs) if (b?.i && !b.removed && b.state && !(b.market && ids.has(b.market))) outsideBurgPeople += (b.population ?? 0) * (w.populationRate ?? 1) * Math.max(1, w.urbanization ?? 1);
  const ships = getSaltShipments() as any[];
  const into = ships.filter(s => s.toMarketId === focus).reduce((a, s) => a + s.bags, 0);
  const from = ships.filter(s => s.fromMarketId === focus && s.toMarketId !== focus).reduce((a, s) => a + s.bags, 0);
  const works = getSaltworks().filter(x => x.active && x.marketId === focus);
  const led = getStateSaltLedgers() as any[];
  out.push({ month: m, focus: mk ? { stock: Math.round(mk.goods[salt.i]?.stock ?? 0), price: mk.goods[salt.i]?.price, shipmentsIn: Math.round(into), shipmentsOut: Math.round(from), works: works.length, worksOutput: Math.round(works.reduce((a, x) => a + x.monthlyOutputBags, 0)), processingForecast: mk.saltProcessingForecastBags } : null,
    outside: { ruralPeople: Math.round(outsidePeople), burgPeople: Math.round(outsideBurgPeople), insideRuralPeople: Math.round(insidePeople) },
    unmet: { household: Math.round(led.reduce((a, l) => a + (l.monthlyUnmetHouseholdBags ?? 0), 0)), livestock: Math.round(led.reduce((a, l) => a + (l.monthlyUnmetLivestockBags ?? 0), 0)) } });
  process.stderr.write(`[s1] ${m}\n`);
}
console.log(JSON.stringify(out));
host.dispose();
