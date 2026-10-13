#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { JSDOM } from "jsdom";
import { runnerImport } from "vite";

const options = new Map();
const knownOptions = new Set(["out", "grid", "size", "river", "castle", "conditions", "seeds", "seed", "patches", "rim-growth", "svg"]);
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith("--") || !process.argv[i + 1]) throw new Error(`Expected --option value at ${process.argv[i]}`);
  const key = process.argv[i].slice(2);
  if (!knownOptions.has(key)) throw new Error(`Unknown option --${key}`);
  options.set(key, process.argv[i + 1]);
}
const list = (key, fallback) => (options.get(key) ?? fallback).split(",");
const grids = list("grid", "hex,voronoi,evolution"), sizes = list("size", "small");
const rivers = list("river", "none,through,meander"), castles = list("castle", "none,small,standard");
const conditions = list("conditions", "A,B,C,D");
const count = Number(options.get("seeds") ?? 3);
const seeds = options.has("seed") ? list("seed", "") : Array.from({ length: count }, (_, i) => `wall-order-${i}`);
for (const [values, allowed] of [[grids, ["hex", "voronoi", "evolution"]], [sizes, ["micro", "tiny", "small", "medium", "large"]], [rivers, ["none", "through", "meander"]], [castles, ["none", "small", "standard"]], [conditions, ["A", "B", "C", "D"]]])
  if (values.some(v => !allowed.includes(v))) throw new Error(`Unknown value in ${values.join(",")}`);
if (!Number.isSafeInteger(count) || count < 1) throw new Error("--seeds must be a positive integer");
if (options.has("patches") && (!Number.isSafeInteger(Number(options.get("patches"))) || Number(options.get("patches")) < 1 || Number(options.get("patches")) > 1200))
  throw new Error("--patches must be an integer from 1 to 1200");
if (options.has("rim-growth") && (!Number.isFinite(Number(options.get("rim-growth"))) || Number(options.get("rim-growth")) < 0 || Number(options.get("rim-growth")) > 100))
  throw new Error("--rim-growth must be from 0 to 100");
if (options.has("svg") && !["all", "none"].includes(options.get("svg"))) throw new Error("--svg must be all or none");
const out = resolve(options.get("out") ?? "temp/wall-order-comparison");
mkdirSync(join(out, "cases"), { recursive: true });
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of ["window", "document", "Node", "Element", "HTMLElement", "SVGElement", "DOMParser", "XMLSerializer", "MutationObserver", "localStorage", "navigator", "getComputedStyle"])
  Object.defineProperty(globalThis, name, { value: dom.window[name], writable: true, configurable: true });
const { module: { runTownWallOrderCase } } = await runnerImport(resolve("scripts/lib/townWallOrderEntry.ts"), { root: process.cwd() });
const rows = [];
const csv = data => {
  if (!data.length) return "";
  const columns = Object.keys(data[0]);
  const cell = v => JSON.stringify(String(v ?? ""));
  return [columns.map(cell).join(","), ...data.map(row => columns.map(c => cell(row[c])).join(","))].join("\n") + "\n";
};
writeFileSync(join(out, "manifest.json"), JSON.stringify({ options: Object.fromEntries(options), seeds, conditions,
  retryPolicy: "first attempt only; identical requested seed and base mesh in every paired case", conditionsDescription: {
    A: "outer-first, original", B: "inner-first, legacy defence (lab only)", C: "outer-first, closure required", D: "inner-first, closure required"
  } }, null, 2));
for (const grid of grids) for (const size of sizes) for (const river of rivers) for (const castle of castles) for (const seed of seeds) for (const condition of conditions) {
  const input = { grid, size, seed };
  if (grid === "evolution" && (options.has("patches") || options.has("rim-growth"))) input.patchParams = {
    ...(options.has("patches") ? { nPatches: Number(options.get("patches")), maxPatches: Math.max(48, Number(options.get("patches"))) } : {}),
    ...(options.has("rim-growth") ? { rimGrowthPercent: Number(options.get("rim-growth")) } : {})
  };
  const result = runTownWallOrderCase(input, condition, river, castle, options.get("svg") !== "none");
  const id = `${String(rows.length).padStart(4, "0")}-${condition}-${grid}-${size}-${river}-${castle}`;
  rows.push({ case: id, ...result.row });
  writeFileSync(join(out, "cases", `${id}.json`), JSON.stringify({ ...result, svg: undefined }, null, 2));
  if (result.svg) writeFileSync(join(out, "cases", `${id}.svg`), result.svg);
  writeFileSync(join(out, "cases.csv"), csv(rows));
  process.stdout.write(`${id}: ${result.row.generated ? `${result.row.rings} rings, closed=${result.row.closed}` : `failed (${result.row.failureReason})`}\n`);
}
const summary = conditions.map(condition => {
  const selected = rows.filter(r => r.condition === condition), doubles = selected.filter(r => r.double);
  return { condition, requested: selected.length, generated: selected.filter(r => r.generated).length,
    double: doubles.length, fallback: selected.filter(r => r.fallback).length,
    failed: selected.filter(r => !r.generated).length, openDouble: doubles.filter(r => !r.closed).length,
    maxRiverOpeningMeters: Math.max(0, ...doubles.map(r => r.riverOpeningMeters)),
    meanMilliseconds: Math.round(selected.reduce((n, r) => n + r.milliseconds, 0) / Math.max(1, selected.length)) };
});
writeFileSync(join(out, "summary.csv"), csv(summary));
console.log(`Saved ${rows.length} cases to ${out}`);
