#!/usr/bin/env node
/**
 * Fetch swissALTI3D (2 m) around the Swiss test sites of the Alps region and average it into
 * lon/lat rasters for the terrain tiles (docs/plan/alps-terrain-tiles.md, A4).
 *
 * Only the test sites are fetched (±--radiusKm, default 5 km): 1 km tiles from the swisstopo STAC
 * download service, newest year per tile, the 2 m XYZ archive (no GeoTIFF decoder needed).
 * Source: Federal Office of Topography swisstopo (OGD; reference "©swisstopo" required).
 *
 * Output (Git-ignored): temp/swissalti3d/
 *   xyz/<tile>.xyz.zip            downloaded archives (kept as a cache)
 *   <site>-<step>m.bin            FMGE raster (int16 meters, land bits all set), lon/lat grid
 *   manifest.json                 { source, levels: [{ stepMeters, file, west, east, south, north }] }
 *
 * Usage: node scripts/fetchSwissAlti3d.mjs [--radiusKm 5] [--stepM 25] [--sites zermatt,lugano]
 * Needs `unzip` on PATH.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "temp/swissalti3d");
const XYZ = path.join(OUT, "xyz");
const STAC = "https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const RADIUS_KM = Number(arg("radiusKm", 5));
const STEP_M = Number(arg("stepM", 25));
// Swiss sites of ALPS_REGION.localTerrain (src/data/earthRegions.ts).
const SITES = [
  { id: "zermatt", lon: 7.66, lat: 46.0 },
  { id: "lauterbrunnen", lon: 7.91, lat: 46.59 },
  { id: "aletsch", lon: 8.03, lat: 46.45 },
  { id: "engadin", lon: 9.84, lat: 46.5 },
  { id: "lugano", lon: 8.95, lat: 46.0 }
].filter(site => {
  const only = arg("sites", "");
  return !only || only.split(",").includes(site.id);
});
const MAGIC = 0x45474d46;

/** swisstopo's approximate LV95 → WGS84 formulas (about 1 m). */
function lv95ToWgs84(e, n) {
  const y = (e - 2600000) / 1e6;
  const x = (n - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x * x * x;
  return [(lon * 100) / 36, (lat * 100) / 36];
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode !== 200) reject(new Error(`${url} → ${res.statusCode}`));
          else resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        });
      })
      .on("error", reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`${url} → ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          fs.writeFileSync(dest, Buffer.concat(chunks));
          resolve();
        });
      })
      .on("error", reject);
  });
}

/** Newest item per 1 km tile in the box: its 2 m XYZ archive URL. */
async function listTiles(box) {
  const newest = new Map();
  let url = `${STAC}?bbox=${box.west},${box.south},${box.east},${box.north}&limit=100`;
  while (url) {
    const page = await getJson(url);
    for (const item of page.features) {
      const [, year, tile] = item.id.split("_");
      const asset = Object.values(item.assets).find(a => /_2_2056_\d+\.xyz\.zip$/.test(a.href));
      if (!asset) continue;
      const prev = newest.get(tile);
      if (!prev || prev.year < year) newest.set(tile, { year, href: asset.href });
    }
    url = page.links.find(link => link.rel === "next")?.href;
  }
  return newest;
}

async function site(site) {
  const kmLat = 110.574;
  const kmLon = 111.32 * Math.cos((site.lat * Math.PI) / 180);
  const box = {
    west: site.lon - RADIUS_KM / kmLon,
    east: site.lon + RADIUS_KM / kmLon,
    south: site.lat - RADIUS_KM / kmLat,
    north: site.lat + RADIUS_KM / kmLat
  };
  const tiles = await listTiles(box);
  const width = Math.round(((box.east - box.west) * kmLon * 1000) / STEP_M);
  const height = Math.round(((box.north - box.south) * kmLat * 1000) / STEP_M);
  const sum = new Float64Array(width * height);
  const count = new Uint32Array(width * height);
  fs.mkdirSync(XYZ, { recursive: true });
  let downloaded = 0;
  for (const [tile, { href }] of tiles) {
    const file = path.join(XYZ, path.basename(href));
    if (!fs.existsSync(file)) {
      await download(href, file);
      downloaded++;
    }
    const text = execFileSync("unzip", ["-p", file], { maxBuffer: 64 * 1024 * 1024 }).toString("latin1");
    let start = text.indexOf("\n") + 1;
    while (start < text.length) {
      const end = text.indexOf("\n", start);
      const line = text.slice(start, end < 0 ? text.length : end);
      start = end < 0 ? text.length : end + 1;
      const [e, n, z] = line.split(" ").map(Number);
      if (!Number.isFinite(z)) continue;
      const [lon, lat] = lv95ToWgs84(e, n);
      const x = Math.floor(((lon - box.west) / (box.east - box.west)) * width);
      const y = Math.floor(((box.north - lat) / (box.north - box.south)) * height);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      sum[y * width + x] += z;
      count[y * width + x]++;
    }
    if (tile.endsWith("0")) process.stdout.write(".");
  }
  const elevation = new Int16Array(width * height).fill(-32768);
  let filled = 0;
  for (let i = 0; i < elevation.length; i++)
    if (count[i]) {
      elevation[i] = Math.round(sum[i] / count[i]);
      filled++;
    }
  const landBytes = Math.ceil((width * height) / 8);
  const out = new Uint8Array(28 + width * height * 2 + landBytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  view.setFloat32(10, box.west, true);
  view.setFloat32(14, box.east, true);
  view.setFloat32(18, box.south, true);
  view.setFloat32(22, box.north, true);
  out.set(new Uint8Array(elevation.buffer), 28);
  out.fill(255, 28 + width * height * 2);
  const name = `${site.id}-${STEP_M}m.bin`;
  fs.writeFileSync(path.join(OUT, name), out);
  console.log(
    `\n${site.id}: ${tiles.size} tiles (${downloaded} downloaded), ${width}×${height} @ ${STEP_M} m, ${((filled / elevation.length) * 100).toFixed(1)}% filled`
  );
  // Float32 header values: store what the reader will decode.
  return {
    stepMeters: STEP_M,
    file: name,
    west: view.getFloat32(10, true),
    east: view.getFloat32(14, true),
    south: view.getFloat32(18, true),
    north: view.getFloat32(22, true)
  };
}

async function main() {
  const t0 = performance.now();
  fs.mkdirSync(OUT, { recursive: true });
  const levels = [];
  for (const s of SITES) levels.push(await site(s));
  const manifestPath = path.join(OUT, "manifest.json");
  const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")).levels : [];
  const merged = [...previous.filter(l => !levels.some(n => n.file === l.file)), ...levels];
  fs.writeFileSync(manifestPath, JSON.stringify({ source: "swissalti3d", levels: merged }, null, 2));
  console.log(`done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
