/** When and where markets are founded or removed during the run, with the new centre's size and distance to the nearest older market. */
import { readFileSync, writeFileSync } from "node:fs";
import { Markets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/markets-generator";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const [input, output, length = "84"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
let month = 0;
const events: any[] = [];
const burgs = () => getWorldContext().pack.burgs as any[];
const describe = () =>
  getMarkets().map((m: any) => {
    const c = burgs()[m.centerBurgId];
    const towns = burgs().filter(b => b?.i && !b.removed && b.market === m.i);
    return { i: m.i, center: m.centerBurgId, pop: c?.population, state: c?.state, towns: towns.length, townPop: +towns.reduce((s, b) => s + (b.population ?? 0), 0).toFixed(2) };
  });
const spacing = () => {
  const w = getWorldContext();
  return ((w.graphWidth + w.graphHeight) * 2) / Math.pow(w.pack.burgs.length, 0.6);
};
const add = Markets.addMarket.bind(Markets);
(Markets as any).addMarket = (burgId: number) => {
  const before = getMarkets().map((m: any) => burgs()[m.centerBurgId]);
  const result = add(burgId);
  const b = burgs()[burgId];
  if (result) {
    const nearest = Math.min(...before.map(c => Math.hypot(c.x - b.x, c.y - b.y)));
    events.push({ month, kind: "add", market: result.i, burg: burgId, pop: b.population, state: b.state, nearestMarketDistance: +nearest.toFixed(1), spacingNow: +spacing().toFixed(1) });
  }
  return result;
};
const remove = Markets.removeMarket.bind(Markets);
(Markets as any).removeMarket = (id: number) => {
  events.push({ month, kind: "remove", market: id });
  return remove(id);
};
const start = describe();
for (month = 1; month <= Number(length); month++) {
  await advanceWorld(host, { months: 1 });
  process.stderr.write(`[birth] ${month}/${length}\n`);
  writeFileSync(output + ".events.json", JSON.stringify({ spacingStart: spacing(), start, events }));
}
const { getMarketCellColumn } = await import("/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/cellTables");
const column = getMarketCellColumn();
const cells = getWorldContext().pack.cells;
const rate = Math.max(1, getWorldContext().populationRate ?? 1);
const rural: Record<number, number> = {};
for (let id = 0; id < column.length; id++) if (cells.h[id] >= 20) rural[column[id]] = (rural[column[id]] ?? 0) + cells.pop[id] * rate;
const end = describe().map(m => ({ ...m, ruralPeople: Math.round(rural[m.i] ?? 0), ruralPurse: +((getMarkets().find((x: any) => x.i === m.i) as any)?.foodLedger?.ruralHouseholdWealth ?? 0).toFixed(1) }));
writeFileSync(output, JSON.stringify({ spacingStart: spacing(), start, events, end }, null, 1));
host.dispose();
