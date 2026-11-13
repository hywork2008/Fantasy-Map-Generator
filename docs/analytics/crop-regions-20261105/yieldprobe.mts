/**
 * Population-weighted crop yield factor of the crop plan (Σ share × suitability × yieldMultiplier,
 * as agriculturalLandUse.ts's cropFactor) by climate band, with the shares re-weighted by
 * suitability^(k - 1/2) to preview stronger suitability nudges (crop-acreage-shares.md S5).
 *
 *   npx tsx docs/analytics/crop-regions-20261105/yieldprobe.mts <map.fmg>...
 */
import { readFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods } from "../../../src/extensions/economy/context/trade";
import * as land from "../../../src/extensions/economy/generators/agriculturalLandUse";
import { readAgriculturalClimate } from "../../../src/extensions/economy/generators/seasonalCropClimate";

const exps = [0.5, 1, 2];
for (const file of process.argv.slice(2)) {
  const host = createNodeSimulationHost();
  await host.loadArchive(new Uint8Array(readFileSync(file)));
  await host.prepare();
  const world = getWorldContext();
  const { cells } = world.pack;
  const crops = getGoods().filter(g => g.crop);
  const rows = new Map<string, { pop: number; factor: number[]; suit: number[] }>();
  for (let c = 0; c < cells.i.length; c++) {
    const pop = cells.pop?.[c] ?? 0;
    if (!(pop > 0) || (cells.h?.[c] ?? 0) < 20) continue;
    const mix = land.getCropMix(world, c, crops);
    if (!mix.length) continue;
    const t = Array.from(readAgriculturalClimate(world, c).monthlyMeanTemperatureC);
    const band = (land as any).getCropClimateBandForCell?.(world, c) ?? `${Math.min(...t) < -3 ? "cold" : "mild"}`;
    const row = rows.get(band) ?? { pop: 0, factor: exps.map(() => 0), suit: exps.map(() => 0) };
    row.pop += pop;
    exps.forEach((k, i) => {
      const w = mix.map(e => e.share * e.suitability ** (k - 0.5));
      const total = w.reduce((a, b) => a + b, 0) || 1;
      row.factor[i] += (pop * mix.reduce((s, e, j) => s + (w[j] / total) * e.suitability * (e.good.crop?.yieldMultiplier ?? 1), 0));
      row.suit[i] += (pop * mix.reduce((s, e, j) => s + (w[j] / total) * e.suitability, 0));
    });
    rows.set(band, row);
  }
  console.log(`## ${file}`);
  let all = 0, f = exps.map(() => 0);
  for (const [band, row] of rows) {
    console.log(`${band} people ${row.pop.toFixed(0)}: ${exps.map((k, i) => `k=${k} factor ${(row.factor[i] / row.pop).toFixed(3)} suit ${(row.suit[i] / row.pop).toFixed(3)}`).join(" | ")}`);
    all += row.pop; row.factor.forEach((v, i) => (f[i] += v));
  }
  console.log(`all: ${exps.map((k, i) => `k=${k} ${(f[i] / all).toFixed(3)}`).join(" | ")}`);
  host.dispose();
}
