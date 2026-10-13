#!/usr/bin/env node
/**
 * Wall-ring lab sweep (docs/plan/ce-multi-ring-walls.md).
 *
 *   npm run ce:wall-lab -- --out temp/wall-lab [options]
 *
 *   --grid hex,voronoi,evolution     grid kinds
 *   --size small,medium,large|auto   presets; auto = nearest to the population window
 *   --population 38255,15000         FMG urban population (radius via the Lot occupancy guide)
 *   --radius 561                     explicit city radius in metres (instead of --population)
 *   --rings "1;0.45,1;0.2,0.5,1"     ring share sets, innermost first, separated by ';'
 *   --castle none,small,standard     castle sizes (none|tiny|small|standard|large)
 *   --seeds 5                        seeds per combination
 *   --gates 4  --min-gap 2  --min-free 7  --min-free-area 3  --occupancy 0.8
 *   --rim-growth 100,50,0            evolution rim cell growth % (100 = current grid)
 *   --patches 48,200                 evolution nPatches override (default: nPatchesForTownCells)
 *   --max-patches 48,400             evolution nPatches ceiling for the automatic count
 *   --svg all|fail|first|none        which cases to draw (default first)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CITY_SIZE_PRESETS, type CitySizePreset, sizePresetForExtent } from "../src/city-editor/generators/document";
import { type GridKind } from "../src/city-editor/types/contracts/document";
import {
  type LabCastleSize,
  runWallRingLab,
  type WallRingLabCase,
  type WallRingLabResult,
  wallRingLabSvg
} from "../src/city-editor/services/analysis/wallRingLab";
import { occupancyRadiusMeters } from "../src/utils/cultureLotOccupancy";
import { populationWindowMeters } from "../src/utils/requiredSiteBounds";

const args = process.argv.slice(2);
const opt = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith("--")) throw new Error(`Unexpected argument ${args[i]}`);
  opt.set(args[i].slice(2), args[i + 1]);
  i++;
}
const list = (key: string, fallback: string) => (opt.get(key) ?? fallback).split(",").map(s => s.trim()).filter(Boolean);
const num = (key: string, fallback: number) => {
  const v = Number(opt.get(key) ?? fallback);
  if (!Number.isFinite(v)) throw new Error(`--${key} must be a number`);
  return v;
};

const out = opt.get("out") ?? "temp/wall-lab";
const grids = list("grid", "hex,voronoi,evolution") as GridKind[];
const sizes = list("size", opt.has("population") ? "auto" : "small,medium,large");
const castles = list("castle", "none,small,standard") as LabCastleSize[];
const ringSets = (opt.get("rings") ?? "1;0.45,1;0.2,0.5,1")
  .split(";")
  .map(s => s.split(",").map(Number))
  .filter(s => s.length && s.every(v => v > 0 && v <= 1));
const seeds = num("seeds", 3);
const svgMode = opt.get("svg") ?? "first";
const occupancy = num("occupancy", 0.8);
const populations = opt.has("population") ? list("population", "").map(Number) : [null];
const rimGrowths = list("rim-growth", "100").map(Number);
const patchCounts = opt.has("patches") ? list("patches", "").map(Number) : [undefined];
const maxPatchesList = opt.has("max-patches") ? list("max-patches", "").map(Number) : [undefined];
const explicitRadius = opt.has("radius") ? num("radius", 0) : null;

for (const g of grids) if (!["hex", "voronoi", "evolution"].includes(g)) throw new Error(`Unknown grid ${g}`);
for (const c of castles) if (!["none", "tiny", "small", "standard", "large"].includes(c)) throw new Error(`Unknown castle ${c}`);

mkdirSync(join(out, "svg"), { recursive: true });
const results: WallRingLabResult[] = [];
const started = Date.now();

for (const population of populations) {
  const popRadius = population !== null ? occupancyRadiusMeters(population, occupancy, { walls: true }) : null;
  for (const sizeArg of sizes) {
    const size = (
      sizeArg === "auto"
        ? sizePresetForExtent(populationWindowMeters(popRadius ?? explicitRadius ?? 400))
        : sizeArg
    ) as CitySizePreset;
    if (!(size in CITY_SIZE_PRESETS)) throw new Error(`Unknown size ${sizeArg}`);
    const extent = CITY_SIZE_PRESETS[size].extentMeters;
    // Same 0.33 default as createGridDocument when no population is given; never past the frame.
    const radius = Math.min(explicitRadius ?? popRadius ?? extent * 0.33, extent * 0.45);
    for (const grid of grids)
      for (const rimGrowth of grid === "evolution" ? rimGrowths : [100])
      for (const nPatches of grid === "evolution" ? patchCounts : [undefined])
      for (const maxPatches of grid === "evolution" ? maxPatchesList : [undefined])
      for (const ringShares of ringSets)
        for (const castle of castles)
          for (let s = 0; s < seeds; s++) {
            const input: WallRingLabCase = {
              grid,
              size,
              seed: `lab-${s}`,
              cityRadiusMeters: radius,
              ringShares,
              castle,
              gates: num("gates", 4),
              minGapCells: num("min-gap", 2),
              minFreeCells: num("min-free", 7),
              minFreeAreaRatio: num("min-free-area", 3),
              rimGrowthPercent: rimGrowth,
              nPatches,
              maxPatches
            };
            const result = runWallRingLab(input);
            (result as WallRingLabResult & { population: number | null }).population = population;
            results.push(result);
            const draw = svgMode === "all" || (svgMode === "fail" && !result.ok) || (svgMode === "first" && s === 0);
            if (draw) {
              const name = `${population ?? "r" + Math.round(radius)}-${grid}${grid === "evolution" ? `-rim${rimGrowth}${nPatches ? `-p${nPatches}` : ""}${maxPatches ? `-max${maxPatches}` : ""}` : ""}-${size}-${ringShares.join("_")}-${castle}-${s}.svg`;
              writeFileSync(join(out, "svg", name), wallRingLabSvg(result));
            }
          }
  }
}

const csv = (rows: (string | number | boolean | null)[][]) =>
  rows.map(r => r.map(v => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(",")).join("\n") + "\n";
const maxRings = Math.max(...results.map(r => r.rings.length));
const ringCols = Array.from({ length: maxRings }, (_, i) =>
  ["faces", "areaM2", "radiusM", "circularity", "gapCells", "gapMeters", "gates", "pinches"].map(c => `ring${i}_${c}`)
).flat();
const header = [
  "population", "grid", "rimGrowth", "nPatches", "maxPatches", "size", "seed", "radiusM", "rings", "ringCount", "castle", "extentM", "meshFaces", "builtUpFaces",
  "medianCellM", ...ringCols, "castleTargetM2", "castleFaces", "castleAreaM2", "freeFaces", "freeAreaM2",
  "freeComponents", "routesPlanned", "routesReached", "gateCuts", "innerGatesReachable", "ok", "failures"
];
const caseRows = results.map(r => {
  const ringValues = Array.from({ length: maxRings }, (_, i) => {
    const s = r.rings[i];
    return s
      ? [s.faces, s.areaM2, s.equivalentRadiusM, s.circularity, s.gapCells, s.gapMeters, s.gates, s.pinches]
      : Array(8).fill(null);
  }).flat();
  return [
    (r as WallRingLabResult & { population: number | null }).population, r.input.grid, r.input.rimGrowthPercent ?? 100, r.input.nPatches ?? "", r.input.maxPatches ?? "", r.input.size, r.input.seed,
    Math.round(r.input.cityRadiusMeters), r.input.ringShares.join("/"), r.rings.length, r.input.castle, r.extentMeters,
    r.meshFaces, r.builtUpFaces, r.medianCellMeters, ...ringValues, r.castleTargetM2, r.castleFaces, r.castleAreaM2,
    r.freeFaces, r.freeAreaM2, r.freeComponents, r.routesPlanned, r.routesReached, r.gateCuts, r.innerGatesReachable, r.ok,
    r.failures.join(" ")
  ];
});
writeFileSync(join(out, "cases.csv"), csv([header, ...caseRows]));

// Summary per combination: pass rate, worst gap, mean free cells, failure tally.
const groups = new Map<string, WallRingLabResult[]>();
for (const r of results) {
  const key = [(r as WallRingLabResult & { population: number | null }).population ?? "", r.input.grid, r.input.rimGrowthPercent ?? 100, r.input.nPatches ?? "", r.input.maxPatches ?? "", r.input.size, r.input.ringShares.join("/"), r.input.castle].join("|");
  groups.set(key, [...(groups.get(key) ?? []), r]);
}
const summaryRows = [...groups.entries()].map(([key, rs]) => {
  const gaps = rs.flatMap(r => r.rings.map(s => s.gapCells).filter((g): g is number => g !== null));
  const tally = new Map<string, number>();
  for (const r of rs) for (const f of r.failures) tally.set(f.replace(/-\d+$/, ""), (tally.get(f.replace(/-\d+$/, "")) ?? 0) + 1);
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return [
    ...key.split("|"),
    rs.length,
    rs.filter(r => r.ok).length,
    Math.round((rs.filter(r => r.ok).length / rs.length) * 100),
    gaps.length ? Math.min(...gaps) : null,
    mean(rs.map(r => r.rings[0].faces)),
    mean(rs.map(r => r.freeFaces)),
    mean(rs.map(r => r.rings[0].gates)),
    mean(rs.map(r => r.rings[0].circularity)),
    mean(rs.map(r => r.medianCellMeters)),
    [...tally].map(([k, v]) => `${k}:${v}`).join(" ")
  ];
});
writeFileSync(
  join(out, "summary.csv"),
  csv([
    ["population", "grid", "rimGrowth", "nPatches", "maxPatches", "size", "rings", "castle", "cases", "ok", "okPercent", "minGapCells", "meanInnerFaces",
      "meanFreeFaces", "meanInnerGates", "meanInnerCircularity", "meanCellM", "failures"],
    ...summaryRows
  ])
);
writeFileSync(
  join(out, "manifest.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      args: Object.fromEntries(opt),
      cases: results.length,
      ok: results.filter(r => r.ok).length,
      elapsedMs: Date.now() - started,
      note: "Geometry only: dry built-up disk, no water/buildings/wall routing. Castle reserves whole cells (CE can cut faces), so castle results are conservative."
    },
    null,
    2
  )
);
console.log(`${results.length} cases, ${results.filter(r => r.ok).length} ok, ${Date.now() - started} ms -> ${out}`);
