/**
 * Where the people of a map live by climate band, soil and culture type, and what the current
 * crop mix plants there (docs/plan/crop-acreage-shares.md S1). Read-only, no simulation advance.
 *
 *   npx tsx docs/analytics/crop-regions-20261105/regionprobe.mts <map.fmg>...
 */
import { readFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods } from "../../../src/extensions/economy/context/trade";
import { getCellSoilType, getCropMix } from "../../../src/extensions/economy/generators/agriculturalLandUse";
import { getCropClimateBand } from "../../../src/extensions/economy/generators/cropAcreageShares";
import { readAgriculturalClimate } from "../../../src/extensions/economy/generators/seasonalCropClimate";

function climateBand(cold: number, warm: number, prec: number): string {
  return getCropClimateBand(cold, warm, prec);
}

const pct = (v: number, t: number) => `${((100 * v) / Math.max(t, 1e-9)).toFixed(1)}`;
for (const file of process.argv.slice(2)) {
  const host = createNodeSimulationHost();
  await host.loadArchive(new Uint8Array(readFileSync(file)));
  await host.prepare();
  const world = getWorldContext();
  const { cells } = world.pack;
  const crops = getGoods().filter(g => g.crop);
  const bands = new Map<string, { pop: number; soil: Record<string, number>; culture: Record<string, number>; crop: Record<string, number>; prec: number[] }>();
  let total = 0;
  for (let c = 0; c < cells.i.length; c++) {
    const pop = cells.pop?.[c] ?? 0;
    if (!(pop > 0) || (cells.h?.[c] ?? 0) < 20) continue;
    const t = Array.from(readAgriculturalClimate(world, c).monthlyMeanTemperatureC);
    const prec = world.grid?.cells.prec?.[cells.g?.[c] ?? c] ?? 0;
    const band = climateBand(Math.min(...t), Math.max(...t), prec);
    const row = bands.get(band) ?? { pop: 0, soil: {}, culture: {}, crop: {}, prec: [] };
    row.pop += pop;
    total += pop;
    const soil = getCellSoilType(world, c);
    row.soil[soil] = (row.soil[soil] ?? 0) + pop;
    const type = world.pack.cultures?.[cells.culture?.[c] ?? 0]?.type ?? "Generic";
    row.culture[type] = (row.culture[type] ?? 0) + pop;
    for (const e of getCropMix(world, c, crops)) row.crop[e.good.name] = (row.crop[e.good.name] ?? 0) + pop * e.share;
    row.prec.push(prec);
    bands.set(band, row);
  }
  console.log(`## ${file} (${world.options?.historicalPeriod ?? "no period"})`);
  for (const [band, row] of [...bands].sort((a, b) => b[1].pop - a[1].pop)) {
    const fmt = (r: Record<string, number>) =>
      Object.entries(r).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, row.pop)}`).join(", ");
    const p = row.prec.toSorted((a, b) => a - b);
    console.log(`${band}: people ${pct(row.pop, total)}%, prec (100 mm) quartiles ${p[p.length >> 2]} / ${p[p.length >> 1]} / ${p[(3 * p.length) >> 2]}`);
    console.log(`  soil: ${fmt(row.soil)}`);
    console.log(`  culture: ${fmt(row.culture)}`);
    console.log(`  crops now: ${fmt(row.crop)}`);
  }
  host.dispose();
}
