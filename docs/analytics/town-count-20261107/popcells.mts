/**
 * Town-count pool of a map (docs/analytics/town-count-20261107.md). Read-only: per biome, the land
 * cells, the cells with s > 0, with a culture, and the Standard-pattern town pool of burgs-generator
 * (`culture && (pop > 0 || s > 0)`), plus the burgs placed and the culture-less land.
 *
 *   npx tsx docs/analytics/town-count-20261107/popcells.mts <map.fmg> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";

const [input, output] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
const world = getWorldContext() as any;
const { cells, burgs, cultures } = world.pack;
const names = (world.biomesData as { name: string[] }).name;
const rows: Record<string, Record<string, number>> = {};
const row = (b: number) => (rows[names[b]] ??= { land: 0, suitable: 0, cultured: 0, pool: 0, burgs: 0, sSum: 0 });
for (let i = 0; i < cells.i.length; i++) {
  if (cells.h[i] < 20) continue;
  const r = row(cells.biomeCode[i]);
  r.land++;
  if (cells.s[i] > 0) r.suitable++;
  if (cells.culture[i]) r.cultured++;
  if (cells.culture[i] && (cells.pop[i] > 0 || cells.s[i] > 0)) r.pool++;
  r.sSum += cells.s[i];
}
for (const b of burgs as any[]) if (b?.i && !b.removed) row(cells.biomeCode[b.cell]).burgs++;
const live = (cultures as any[]).filter(c => c?.i && !c.removed);
writeFileSync(
  output,
  JSON.stringify({ input, cultures: live.map(c => ({ i: c.i, name: c.name, center: c.center, biome: names[cells.biomeCode[c.center]], s: cells.s[c.center], type: c.type, expansionism: c.expansionism, cells: Array.from(cells.culture as Uint16Array).filter(x => x === c.i).length })), rows })
);
process.exit(0);
