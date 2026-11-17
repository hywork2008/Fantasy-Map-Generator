#!/usr/bin/env node
/**
 * Valley cross-sections of real Japanese rivers, for designing synthetic valleys inside FMG cells
 * (docs/plan/fmg-cell-valleys.md).
 *
 * Inputs (local, Git-ignored): public/heightmaps/earth/japan-local/rivers.json (GSI Global Map
 * Japan rivers, 1:1,000,000) and the terrain tiles in public/heightmaps/earth/japan-tiles/ (z4,
 * 250 m; z5, 125 m where baked). Every `--everyKm` along each river a section is taken across
 * the river, out to `--reachKm` on each side.
 *
 * Per section: floor (lowest point within `--floorKm` of the line, which absorbs the 1:1M line
 * error), crest on each side (highest point), depth (lower crest minus floor), half-depth width,
 * floor width (within 10 % of the depth above the floor), side slope, asymmetry, and the
 * normalized shape (height / depth at fractions of the crest distance).
 *
 * Output: summary to stdout (markdown) and every section to
 * docs/analytics/raw/japan-valley-profiles/sections.json (Git-ignored).
 *
 * Usage: node scripts/sampleJapanValleyProfiles.mjs [--everyKm 2] [--reachKm 6] [--floorKm 0.75]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TILES = path.join(ROOT, "public/heightmaps/earth/japan-tiles");
const RIVERS = path.join(ROOT, "public/heightmaps/earth/japan-local/rivers.json");
const OUT = path.join(ROOT, "docs/analytics/raw/japan-valley-profiles");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const EVERY_KM = arg("everyKm", 2);
const REACH_KM = arg("reachKm", 6);
const FLOOR_KM = arg("floorKm", 0.75);
const STEP_KM = 0.125;
const SHAPE_FRACTIONS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const DEPTH_CLASSES = [
  [0, 50],
  [50, 150],
  [150, 300],
  [300, 600],
  [600, 1000],
  [1000, Infinity]
];

const index = JSON.parse(fs.readFileSync(path.join(TILES, "index.json"), "utf8"));
const localIndex = path.join(TILES, "index.local.json");
if (fs.existsSync(localIndex))
  for (const level of JSON.parse(fs.readFileSync(localIndex, "utf8")).levels)
    if (level.z === index.levels.length) index.levels.push(level);
const { frame, region } = index;
const stored = index.samples + 2 * (index.border ?? 0);
const border = index.border ?? 0;

// Finest first: z5 (125 m) where baked, then z4 (250 m), then z3 (500 m).
const levels = index.levels
  .filter(level => level.z >= 3)
  .sort((a, b) => b.z - a.z)
  .map(level => {
    const bytes = fs.readFileSync(path.join(TILES, level.file));
    const data = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const tiles = new Map(level.tiles.map(([x, y, offset]) => [`${x}/${y}`, offset / 2]));
    return { ...level, data, tiles };
  });

function meters(xKm, yKm) {
  for (const level of levels) {
    const tx = Math.floor(xKm / level.sizeKm);
    const ty = Math.floor(yKm / level.sizeKm);
    const start = level.tiles.get(`${tx}/${ty}`);
    if (start === undefined) continue;
    const fx = (xKm - tx * level.sizeKm) / level.spacingKm + border;
    const fy = (yKm - ty * level.sizeKm) / level.spacingKm + border;
    const x0 = Math.min(stored - 2, Math.floor(fx));
    const y0 = Math.min(stored - 2, Math.floor(fy));
    const u = fx - x0;
    const v = fy - y0;
    const at = (i, j) => level.data[start + (y0 + j) * stored + x0 + i];
    const a = at(0, 0);
    const b = at(1, 0);
    const c = at(0, 1);
    const d = at(1, 1);
    if ([a, b, c, d].includes(index.nodata)) continue;
    return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) * index.unitMeters;
  }
  return null;
}

const toKm = ([lon, lat]) => [(lon - region.west) * frame.kmPerDegLon, (region.north - lat) * frame.kmPerDegLat];

function section(px, py, nx, ny) {
  const n = Math.round(REACH_KM / STEP_KM);
  const heights = [];
  for (let k = -n; k <= n; k++) {
    const m = meters(px + nx * k * STEP_KM, py + ny * k * STEP_KM);
    if (m === null || m < 0) return null; // sea or no data: not a land valley
    heights.push(m);
  }
  const mid = n;
  const floorReach = Math.round(FLOOR_KM / STEP_KM);
  let floorAt = mid;
  for (let k = mid - floorReach; k <= mid + floorReach; k++) if (heights[k] < heights[floorAt]) floorAt = k;
  const floor = heights[floorAt];
  // Crest on each side: the highest point between the floor and the end of the reach.
  let left = floorAt;
  for (let k = floorAt; k >= 0; k--) if (heights[k] > heights[left]) left = k;
  let right = floorAt;
  for (let k = floorAt; k < heights.length; k++) if (heights[k] > heights[right]) right = k;
  const leftRise = heights[left] - floor;
  const rightRise = heights[right] - floor;
  const depth = Math.min(leftRise, rightRise);
  if (depth <= 0) return null;
  const widthAt = level => {
    let a = floorAt;
    while (a > 0 && heights[a] - floor < level) a--;
    let b = floorAt;
    while (b < heights.length - 1 && heights[b] - floor < level) b++;
    return (b - a) * STEP_KM;
  };
  // Normalized shape on the lower side out to its crest: height / depth at fractions of distance.
  const lowSide = leftRise <= rightRise ? -1 : 1;
  const crest = lowSide < 0 ? left : right;
  const span = Math.abs(crest - floorAt);
  const shape = SHAPE_FRACTIONS.map(f => {
    const k = floorAt + lowSide * Math.round(f * span);
    return +((heights[k] - floor) / depth).toFixed(3);
  });
  return {
    floor: Math.round(floor),
    depth: Math.round(depth),
    leftCrestKm: (floorAt - left) * STEP_KM,
    rightCrestKm: (right - floorAt) * STEP_KM,
    halfDepthWidthKm: widthAt(depth * 0.5),
    floorWidthKm: widthAt(depth * 0.1),
    slopeDeg: +((Math.atan(depth / (span * STEP_KM * 1000)) * 180) / Math.PI).toFixed(1),
    asymmetry: +(Math.max(leftRise, rightRise) / Math.min(leftRise, rightRise)).toFixed(2),
    offsetKm: (floorAt - mid) * STEP_KM,
    shape
  };
}

const rivers = JSON.parse(fs.readFileSync(RIVERS, "utf8")).rivers;
const sections = [];
for (const river of rivers) {
  const pts = river.points.map(toKm);
  let carry = EVERY_KM / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (!(len > 0)) continue;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    let t = carry;
    while (t <= len) {
      const s = section(ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len, nx, ny);
      if (s) sections.push({ x: +(ax + ((bx - ax) * t) / len).toFixed(2), y: +(ay + ((by - ay) * t) / len).toFixed(2), ...s });
      t += EVERY_KM;
    }
    carry = t - len;
  }
}

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN;
};
const fmt = v => (Number.isFinite(v) ? (Math.abs(v) >= 10 ? Math.round(v) : +v.toFixed(2)) : "-");
console.log(`sections ${sections.length} (every ${EVERY_KM} km, reach ±${REACH_KM} km, floor ±${FLOOR_KM} km)\n`);
console.log(
  "| depth | sections | share | floor m (p50) | half-depth width km (p25/p50/p75) | floor width km (p50) | crest km (p50) | slope ° (p50/p90) | asymmetry (p50) | floor offset km (p50 abs) |"
);
console.log("| :--- | ---: | ---: | ---: | :--- | ---: | ---: | :--- | ---: | ---: |");
const shapes = [];
for (const [lo, hi] of DEPTH_CLASSES) {
  const group = sections.filter(s => s.depth >= lo && s.depth < hi);
  if (!group.length) continue;
  const col = key => group.map(s => s[key]);
  const crest = group.map(s => (s.leftCrestKm + s.rightCrestKm) / 2);
  console.log(
    `| ${lo}–${hi === Infinity ? "" : hi} m | ${group.length} | ${((group.length / sections.length) * 100).toFixed(1)}% | ${fmt(quantile(col("floor"), 0.5))} | ${fmt(quantile(col("halfDepthWidthKm"), 0.25))} / ${fmt(quantile(col("halfDepthWidthKm"), 0.5))} / ${fmt(quantile(col("halfDepthWidthKm"), 0.75))} | ${fmt(quantile(col("floorWidthKm"), 0.5))} | ${fmt(quantile(crest, 0.5))} | ${fmt(quantile(col("slopeDeg"), 0.5))} / ${fmt(quantile(col("slopeDeg"), 0.9))} | ${fmt(quantile(col("asymmetry"), 0.5))} | ${fmt(quantile(group.map(s => Math.abs(s.offsetKm)), 0.5))} |`
  );
  shapes.push([lo, hi, SHAPE_FRACTIONS.map((_, i) => quantile(group.map(s => s.shape[i]), 0.5))]);
}
console.log("\nMedian normalized side shape (height / depth from the floor to the lower crest):\n");
console.log(`| depth | ${SHAPE_FRACTIONS.map(f => f.toFixed(1)).join(" | ")} |`);
console.log(`| :--- | ${SHAPE_FRACTIONS.map(() => "---:").join(" | ")} |`);
for (const [lo, hi, shape] of shapes)
  console.log(`| ${lo}–${hi === Infinity ? "" : hi} m | ${shape.map(v => v.toFixed(2)).join(" | ")} |`);

fs.mkdirSync(OUT, { recursive: true });
const json = JSON.stringify({ everyKm: EVERY_KM, reachKm: REACH_KM, floorKm: FLOOR_KM, stepKm: STEP_KM, sections });
fs.writeFileSync(path.join(OUT, "sections.json"), json);
console.log(
  `\nwrote docs/analytics/raw/japan-valley-profiles/sections.json ${json.length} bytes ${crypto.createHash("sha256").update(json).digest("hex")}`
);
