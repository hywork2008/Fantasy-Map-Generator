/**
 * Town people and Glass's calibrated floor by the markets' mean temperature band
 * (docs/analytics/glass-houses-20261107.md). Read-only, at the map's start.
 *
 *   npx tsx docs/analytics/glass-houses-20261107/townprobe.mts <map.fmg> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getMarketCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getMarkets } from "../../../src/extensions/economy/context/trade";
import { getCalibratedMonthlyLots } from "../../../src/extensions/economy/generators/craftDemandCalibration";
import { laborPeople } from "../../../src/extensions/economy/generators/craftScale";

const [input, output] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
const world = getWorldContext();
const { pack, grid } = world;
const rate = Math.max(1, world.populationRate ?? 1);
const band = (t: number) => (t >= 8 ? ">=8" : t >= 4 ? "4-8" : t >= 0 ? "0-4" : "<0");
const cellMarket = getMarketCellColumn();
const temps = new Map<number, { sum: number; cells: number }>();
for (const cellId of pack.cells.i) {
  if (pack.cells.h[cellId] < 20) continue;
  const m = cellMarket?.[cellId] ?? 0;
  if (!m) continue;
  const row = temps.get(m) ?? { sum: 0, cells: 0 };
  row.sum += grid.cells.temp[pack.cells.g[cellId]];
  row.cells++;
  temps.set(m, row);
}
const bandByMarket = new Map<number, string>();
for (const market of getMarkets()) {
  const row = temps.get(market.i);
  bandByMarket.set(market.i, row ? band(row.sum / row.cells) : "none");
}
const rows: Record<string, { towns: number; townPeople: number; ruralPeople: number; glassFloorLotsYear: number }> = {};
for (const burg of pack.burgs) {
  if (!burg?.i || burg.removed || !burg.market) continue;
  const b = bandByMarket.get(burg.market) ?? "none";
  rows[b] ??= { towns: 0, townPeople: 0, ruralPeople: 0, glassFloorLotsYear: 0 };
  const people = laborPeople(burg.population ?? 0, rate);
  rows[b].towns++;
  rows[b].townPeople += people;
  rows[b].glassFloorLotsYear += 12 * getCalibratedMonthlyLots({ goodName: "Glass", laborPeopleBurg: people, port: Boolean(burg.port) });
}
for (const cellId of pack.cells.i) {
  const b = bandByMarket.get(cellMarket?.[cellId] ?? 0);
  if (!b || !rows[b]) continue;
  rows[b].ruralPeople += (pack.cells.pop[cellId] ?? 0) * 1000;
}
writeFileSync(output, JSON.stringify({ input, rate, rows }));
console.log(`[townprobe] ${input}`, JSON.stringify(rows));
process.exit(0);
