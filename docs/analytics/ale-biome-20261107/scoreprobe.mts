/**
 * What a cell's carrying capacity is made of, per biome (docs/analytics/ale-biome-20261107.md).
 * Read-only, at the map's start: rankCells() (src/main.ts) scores a land cell by its biome's
 * habitability, plus a river term (flux, up to 250), minus (height - 50) / 5, plus a coast or lake
 * term; capacity = score / 5 * area / mean area. Per biome: land cells, mean habitability, mean
 * score, mean river term (recomputed), share of cells on the coast, mean height, K per cell, K and rural people per km².
 *
 *   npx tsx docs/analytics/ale-biome-20261107/scoreprobe.mts <map.fmg> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";

const [input, output] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
const world = getWorldContext() as any;
const { cells } = world.pack;
const rate = Math.max(1, world.populationRate ?? 1);
const hab: number[] = world.biomesData.habitability;
const names: string[] = world.biomesData.name;
const land = [...cells.i].filter((i: number) => cells.h[i] >= 20);
const flux = land.map((i: number) => cells.fl[i] + cells.conf[i]);
const meanFlux = flux.reduce((a: number, b: number) => a + b, 0) / Math.max(1, flux.length);
const maxFlux = Math.max(...flux);
const rows = new Map<number, Record<string, number>>();
for (const i of land) {
  const b = cells.biomeCode[i];
  if (!hab[b]) continue;
  const r = rows.get(b) ?? { cells: 0, hab: hab[b], score: 0, river: 0, coast: 0, height: 0, K: 0, km2: 0, rural: 0 };
  const f = cells.fl[i] + cells.conf[i];
  r.cells++;
  r.score += (cells.s[i] ?? 0) * 5;
  r.river += maxFlux > meanFlux ? (Math.min(Math.max((f - meanFlux) / (maxFlux - meanFlux), 0), 1)) * 250 : 0;
  r.coast += cells.t[i] === 1 ? 1 : 0;
  r.height += cells.h[i];
  r.K += (cells.capacity[i] ?? 0) * rate;
  r.km2 += (cells.area[i] ?? 0) * (world.distanceScale || 1) ** 2;
  r.rural += (cells.pop[i] ?? 0) * rate;
  rows.set(b, r);
}
const out = [...rows.entries()].map(([b, r]) => ({
  biome: names[b],
  habitability: r.hab,
  cells: r.cells,
  meanScore: Math.round(r.score / r.cells),
  meanRiver: Math.round(r.river / r.cells),
  coastShare: Math.round((100 * r.coast) / r.cells) / 100,
  meanHeight: Math.round(r.height / r.cells),
  kPerCell: Math.round(r.K / r.cells),
  kPerKm2: Math.round((10 * r.K) / Math.max(1, r.km2)) / 10,
  ruralPerKm2: Math.round((10 * r.rural) / Math.max(1, r.km2)) / 10
}));
writeFileSync(output, JSON.stringify({ input, rows: out }));
process.exit(0);
