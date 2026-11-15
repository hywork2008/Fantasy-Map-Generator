/**
 * Honey harvest per biome at the map's start (docs/analytics/honey-biome-20261107.md). Read-only:
 * each land cell's rural Honey contribution (getRuralProductionContributions, preview) in barrels a
 * month, with the cell's rural people, summed per biome.
 *
 *   npx tsx docs/analytics/honey-biome-20261107/honeyprobe.mts <map.fmg> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { getGoods } from "../../../src/extensions/economy/context/trade";
import { getRuralProductionContributions } from "../../../src/extensions/economy/generators/production-utils";

const [input, output] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
const world = getWorldContext() as any;
const { cells } = world.pack;
const rate = Math.max(1, world.populationRate ?? 1);
const names = (world.biomesData as { name: string[] }).name;
const honey = getGoods().find((g: any) => g.name === "Honey")!;
const production = Goods.getBiomesProduction();
const rows: Record<string, { cells: number; rural: number; honeyBarrelsPerMonth: number }> = {};
for (let i = 0; i < cells.i.length; i++) {
  if (cells.h[i] < 20) continue;
  const r = (rows[names[cells.biomeCode[i]]] ??= { cells: 0, rural: 0, honeyBarrelsPerMonth: 0 });
  r.cells++;
  r.rural += (cells.pop[i] ?? 0) * rate;
  for (const c of getRuralProductionContributions(i, production, { preview: true, excludeLiveAnimals: true }))
    if (c.goodId === honey.i) r.honeyBarrelsPerMonth += c.amount;
}
writeFileSync(output, JSON.stringify({ input, rows }));
process.exit(0);
