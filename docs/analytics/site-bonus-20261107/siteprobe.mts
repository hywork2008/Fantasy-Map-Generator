/**
 * Per-biome carrying capacity K under several site-bonus settings (docs/analytics/site-bonus-20261107.md).
 * Read-only, at the map's start: recomputes rankCells() (src/main.ts) on the loaded cells with
 * scoreCellSite() for each `fullBonusHabitability`, including the Int16 truncation of `cells.s` and
 * the danger multiplier, and reports per biome the land cells, the share left with s = 0, K per km²
 * and the coast share of K.
 *
 *   npx tsx docs/analytics/site-bonus-20261107/siteprobe.mts <map.fmg> <out.json> 1,15,25,50,100
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { scoreCellSite } from "../../../src/generators/siteSuitability";
import { dangerSuitabilityMultiplier } from "../../../src/generators/dangerExpandPolicy";

const [input, output, list] = process.argv.slice(2);
const settings = (list ?? "1,15,25,50,100").split(",").map(Number);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
const world = getWorldContext() as any;
const { cells, features } = world.pack;
const hab: number[] = world.biomesData.habitability;
const names: string[] = world.biomesData.name;
const fluxes = [...cells.fl].filter((f: number) => f).sort((a: number, b: number) => a - b);
const meanFlux = fluxes.length ? (fluxes[(fluxes.length - 1) >> 1] + fluxes[fluxes.length >> 1]) / 2 : 0;
const maxFlux = Math.max(...cells.fl) + Math.max(...cells.conf);
const meanArea = [...cells.area].reduce((a: number, b: number) => a + b, 0) / cells.area.length;
const scale = (world.distanceScale || 1) ** 2;
const scoreMap: Record<string, number> = { estuary: 15, ocean_coast: 5, save_harbor: 20, freshwater: 30, salt: 10, frozen: 1, dry: -5, sinkhole: -5, lava: -30 };

function terms(i: number): number[] {
  const t: number[] = [];
  if (meanFlux && maxFlux > meanFlux)
    t.push(Math.min(1, Math.max(0, (cells.fl[i] + cells.conf[i] - meanFlux) / (maxFlux - meanFlux))) * 250);
  t.push(-(cells.h[i] - 50) / 5);
  if (cells.t[i] === 1) {
    if (cells.r[i]) t.push(scoreMap.estuary);
    const feature = features[cells.f[cells.haven[i]]];
    if (feature?.type === "lake") t.push(scoreMap[feature.group] || 0);
    else {
      t.push(scoreMap.ocean_coast);
      if (cells.harbor[i] === 1) t.push(scoreMap.save_harbor);
    }
  }
  return t;
}

const out: Record<string, unknown>[] = [];
for (const H of settings) {
  const rows = new Map<number, { cells: number; empty: number; K: number; km2: number; coastK: number }>();
  for (const i of cells.i) {
    if (cells.h[i] < 20 || !hab[cells.biomeCode[i]]) continue;
    const b = cells.biomeCode[i];
    let s = Math.trunc(scoreCellSite(hab[b], terms(i), H) / 5);
    const danger = cells.danger ? cells.danger[i] : 0;
    if (danger > 0) s = Math.round(s * dangerSuitabilityMultiplier(danger));
    const K = s > 0 ? (s * cells.area[i]) / meanArea : 0;
    const r = rows.get(b) ?? { cells: 0, empty: 0, K: 0, km2: 0, coastK: 0 };
    r.cells++;
    if (s <= 0) r.empty++;
    r.K += K;
    r.km2 += cells.area[i] * scale;
    if (cells.t[i] === 1) r.coastK += K;
    rows.set(b, r);
  }
  for (const [b, r] of rows)
    out.push({
      setting: H,
      biome: names[b],
      habitability: hab[b],
      cells: r.cells,
      emptyShare: r.empty / r.cells,
      K: r.K,
      kPerKm2: r.K / Math.max(1e-9, r.km2),
      coastShareOfK: r.K > 0 ? r.coastK / r.K : 0
    });
}
writeFileSync(output, JSON.stringify({ input, settings, rows: out }));
process.exit(0);
