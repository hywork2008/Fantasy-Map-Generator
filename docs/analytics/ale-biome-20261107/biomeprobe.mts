/**
 * The biomes of each market's land (docs/analytics/ale-biome-20261107.md). Read-only, at the map's
 * start: per market and biome, the land cells, the carrying capacity K (`cells.capacity`, the upstream
 * habitability), the Economy's subsistence capacity, the rural people and the towns' people.
 *
 *   npx tsx docs/analytics/ale-biome-20261107/biomeprobe.mts <map.fmg> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getMarketCellColumn } from "../../../src/extensions/economy/context/cellTables";

const [input, output] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
const world = getWorldContext() as any;
const { cells, burgs } = world.pack;
const rate = Math.max(1, world.populationRate ?? 1);
const marketOf = getMarketCellColumn();
const biomes = world.biomesData as { name: string[]; habitability: number[] };
const rows = new Map<string, Record<string, number>>();
const add = (market: number, biome: number, key: string, v: number) => {
  const id = `${market}:${biome}`;
  const row = rows.get(id) ?? { market, biome, cells: 0, capacity: 0, subsistence: 0, rural: 0, urban: 0 };
  row[key] += v;
  rows.set(id, row);
};
for (let i = 0; i < cells.i.length; i++) {
  if (cells.h[i] < 20) continue;
  const market = marketOf[i] ?? 0;
  const biome = cells.biomeCode[i];
  add(market, biome, "cells", 1);
  add(market, biome, "capacity", (cells.capacity?.[i] ?? 0) * rate);
  add(market, biome, "subsistence", (cells.subsistenceCapacity?.[i] ?? cells.capacity?.[i] ?? 0) * rate);
  add(market, biome, "rural", (cells.pop?.[i] ?? 0) * rate);
}
for (const b of burgs as any[]) if (b?.i && !b.removed) add(b.market ?? 0, cells.biomeCode[b.cell], "urban", (b.population ?? 0) * rate);
writeFileSync(
  output,
  JSON.stringify({
    input,
    biomes: biomes.name.map((name, i) => ({ i, name, habitability: biomes.habitability[i] })),
    rows: [...rows.values()].map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)])))
  })
);
process.exit(0);
