#!/usr/bin/env node
/**
 * Bake real-DEM levels for the Japan local war terrain (docs/plan/japan-local-war-terrain.md).
 *
 * For each level, one FMGE raster (same format as japan.bin) covers the bbox of the selected
 * prefectures. Elevation is kept inside the prefecture polygons plus a buffer and is NODATA
 * elsewhere, so the runtime falls back to a coarser level there. Land bits come from every
 * Japanese prefecture polygon in the bbox. Levels of 500 m and coarser go to manifest.json
 * (committed); finer levels go to manifest.local.json (Git-ignored).
 *
 * Input: Natural Earth 10m admin-1 GeoJSON (public domain) in temp/japan-local/.
 * Elevation (`--source`):
 * - `terrarium` (default): AWS Terrain Tiles, cached in temp/terrarium-cache/.
 * - `gsi`: GSI elevation tiles (DEM10B PNG, z ≤ 14), cached in temp/gsi-dem-cache/.
 *   Licence: Public Data License v1.0 (attribution: 国土地理院 標高タイル). Files get a `-gsi` suffix.
 *
 * Usage:
 *   node scripts/bakeJapanLocalDem.mjs [--prefs JP-21,JP-20,JP-23,JP-25,JP-24] [--levels 1000,500,250] [--source gsi]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN1 = path.join(ROOT, "temp/japan-local/ne_10m_admin_1_states_provinces.geojson");
const ADMIN1_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
const SOURCE = process.argv.includes("--source") ? process.argv[process.argv.indexOf("--source") + 1] : "terrarium";
const SOURCES = {
  terrarium: {
    dir: path.join(ROOT, "temp/terrarium-cache"),
    url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    maxZoom: 13,
    decode: (r, g, b) => r * 256 + g + b / 256 - 32768
  },
  gsi: {
    dir: path.join(ROOT, "temp/gsi-dem-cache"),
    url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`,
    maxZoom: 14,
    // x = R·2^16 + G·2^8 + B; 2^23 is no data; above it is negative.
    decode: (r, g, b) => {
      const v = r * 65536 + g * 256 + b;
      if (v === 8388608) return null;
      return (v < 8388608 ? v : v - 16777216) * 0.01;
    }
  }
};
const SRC = SOURCES[SOURCE];
if (!SRC) throw new Error(`Unknown --source ${SOURCE}`);
const TILE_DIR = SRC.dir;
const OUT_DIR = path.join(ROOT, "public/heightmaps/earth/japan-local");
const NODATA = -32768;
const MAGIC = 0x45474d46;
const VERSION = 1;
const BUFFER_KM = 3;
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const PREFS = arg("prefs", "JP-21,JP-20,JP-23,JP-25,JP-24").split(",");
const LEVELS = arg("levels", "1000,500,250")
  .split(",")
  .map(Number)
  .filter(value => value > 0)
  .sort((a, b) => b - a);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          reject(new Error(`${url} → ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", err => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function polygonsOf(geom) {
  if (!geom) return [];
  return geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
}

/** Even-odd scanline fill of lon/lat polygons onto a width×height grid over bbox. */
function rasterize(features, bbox, width, height) {
  const mask = new Uint8Array(width * height);
  const px = lon => ((lon - bbox.west) / (bbox.east - bbox.west)) * width;
  const py = lat => ((bbox.north - lat) / (bbox.north - bbox.south)) * height;
  for (const feature of features) {
    for (const poly of polygonsOf(feature.geometry)) {
      const buckets = Array.from({ length: height }, () => []);
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          let x0 = px(ring[i][0]);
          let y0 = py(ring[i][1]);
          let x1 = px(ring[i + 1][0]);
          let y1 = py(ring[i + 1][1]);
          if (y0 === y1) continue;
          if (y0 > y1) [x0, y0, x1, y1] = [x1, y1, x0, y0];
          const dx = (x1 - x0) / (y1 - y0);
          const yStart = Math.max(0, Math.ceil(y0 - 0.5));
          const yEnd = Math.min(height - 1, Math.floor(y1 - 0.5));
          for (let y = yStart; y <= yEnd; y++) buckets[y].push(x0 + (y + 0.5 - y0) * dx);
        }
      }
      for (let y = 0; y < height; y++) {
        const xs = buckets[y].sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          const a = Math.max(0, Math.ceil(xs[i] - 0.5));
          const b = Math.min(width - 1, Math.floor(xs[i + 1] - 0.5));
          for (let x = a; x <= b; x++) mask[y * width + x] = 1;
        }
      }
    }
  }
  return mask;
}

/** Square dilation by `radius` cells (separable max filter). */
function dilate(mask, width, height, radius) {
  if (radius <= 0) return mask;
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    let last = -Infinity;
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) last = x;
      if (x - last <= radius) tmp[y * width + x] = 1;
    }
    last = Infinity;
    for (let x = width - 1; x >= 0; x--) {
      if (mask[y * width + x]) last = x;
      if (last - x <= radius) tmp[y * width + x] = 1;
    }
  }
  for (let x = 0; x < width; x++) {
    let last = -Infinity;
    for (let y = 0; y < height; y++) {
      if (tmp[y * width + x]) last = y;
      if (y - last <= radius) out[y * width + x] = 1;
    }
    last = Infinity;
    for (let y = height - 1; y >= 0; y--) {
      if (tmp[y * width + x]) last = y;
      if (last - y <= radius) out[y * width + x] = 1;
    }
  }
  return out;
}

function tileXY(lon, lat, z) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  };
}

/** Smallest zoom whose pixel is at most half the level step at this latitude. */
function zoomFor(stepMeters, lat) {
  for (let z = 6; z <= SRC.maxZoom; z++) {
    const pixel = ((40075016 * Math.cos((lat * Math.PI) / 180)) / 2 ** z) / 256;
    if (pixel <= stepMeters / 2) return z;
  }
  return SRC.maxZoom;
}

async function loadTiles(bbox, z) {
  fs.mkdirSync(TILE_DIR, { recursive: true });
  const nw = tileXY(bbox.west, bbox.north, z);
  const se = tileXY(bbox.east, bbox.south, z);
  const tiles = new Map();
  for (let x = Math.floor(nw.x); x <= Math.floor(se.x); x++) {
    for (let y = Math.floor(nw.y); y <= Math.floor(se.y); y++) {
      const dest = path.join(TILE_DIR, `${z}-${x}-${y}.png`);
      const missing = `${dest}.missing`;
      if (fs.existsSync(missing)) continue;
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 100) {
        try {
          await download(SRC.url(z, x, y), dest);
        } catch (error) {
          // GSI has no tile over open sea: remember the 404 and treat it as no data.
          if (!String(error.message).endsWith("404")) throw error;
          fs.writeFileSync(missing, "");
          continue;
        }
      }
      tiles.set(`${x},${y}`, PNG.sync.read(fs.readFileSync(dest)));
    }
  }
  return tiles;
}

function terrariumAt(tiles, z, lon, lat) {
  const { x, y } = tileXY(lon, lat, z);
  const gx = x * 256 - 0.5;
  const gy = y * 256 - 0.5;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const read = (px, py) => {
    const tile = tiles.get(`${Math.floor(px / 256)},${Math.floor(py / 256)}`);
    if (!tile) return null;
    const i = ((((py % 256) + 256) % 256) * 256 + (((px % 256) + 256) % 256)) * 4;
    return SRC.decode(tile.data[i], tile.data[i + 1], tile.data[i + 2]);
  };
  const v00 = read(x0, y0);
  const v10 = read(x0 + 1, y0);
  const v01 = read(x0, y0 + 1);
  const v11 = read(x0 + 1, y0 + 1);
  if (v00 == null || v10 == null || v01 == null || v11 == null) return NODATA;
  const fx = gx - x0;
  const fy = gy - y0;
  const value = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
  return Math.max(-500, Math.min(9000, Math.round(value)));
}

function encodeRaster(bbox, width, height, elevation, land) {
  const elevBytes = width * height * 2;
  const out = new Uint8Array(28 + elevBytes + Math.ceil((width * height) / 8));
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  view.setFloat32(10, bbox.west, true);
  view.setFloat32(14, bbox.east, true);
  view.setFloat32(18, bbox.south, true);
  view.setFloat32(22, bbox.north, true);
  out.set(new Uint8Array(elevation.buffer), 28);
  for (let i = 0; i < width * height; i++) if (land[i]) out[28 + elevBytes + (i >> 3)] |= 1 << (i & 7);
  return out;
}

function boundsOf(features) {
  const b = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
  for (const feature of features)
    for (const poly of polygonsOf(feature.geometry))
      for (const ring of poly)
        for (const [lon, lat] of ring) {
          b.west = Math.min(b.west, lon);
          b.east = Math.max(b.east, lon);
          b.south = Math.min(b.south, lat);
          b.north = Math.max(b.north, lat);
        }
  return b;
}

async function main() {
  if (!fs.existsSync(ADMIN1)) {
    fs.mkdirSync(path.dirname(ADMIN1), { recursive: true });
    console.log("GET", ADMIN1_URL);
    await download(ADMIN1_URL, ADMIN1);
  }
  console.log("admin-1", path.relative(ROOT, ADMIN1), "sha256", sha256(ADMIN1));
  const japan = JSON.parse(fs.readFileSync(ADMIN1, "utf8")).features.filter(f => f.properties.adm0_a3 === "JPN");
  // Keep only polygons inside the Japan map region (drops Ogasawara, Okinotorishima, Minamitorishima).
  const REGION = { west: 118.5, east: 146.4, south: 29.9, north: 46.6 };
  const inRegion = poly =>
    poly[0].some(([lon, lat]) => lon >= REGION.west && lon <= REGION.east && lat >= REGION.south && lat <= REGION.north);
  const clip = feature => {
    const polys = polygonsOf(feature.geometry).filter(inRegion);
    return polys.length ? { ...feature, geometry: { type: "MultiPolygon", coordinates: polys } } : null;
  };
  const selected = japan
    .filter(f => PREFS.includes(f.properties.iso_3166_2))
    .map(clip)
    .filter(Boolean);
  if (!selected.length) {
    console.log("outside the map region:", PREFS.join(","));
    return;
  }

  const raw = boundsOf(selected);
  const midLat = (raw.south + raw.north) / 2;
  const padLat = BUFFER_KM / KM_PER_DEG_LAT;
  const padLon = BUFFER_KM / (KM_PER_DEG_LON_EQUATOR * Math.cos((midLat * Math.PI) / 180));
  const bbox = { west: raw.west - padLon, east: raw.east + padLon, south: raw.south - padLat, north: raw.north + padLat };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const bundle = PREFS.map(code => code.replace("JP-", "")).join("-");
  const levels = [];
  for (const stepMeters of LEVELS) {
    const kmLon = KM_PER_DEG_LON_EQUATOR * Math.cos((midLat * Math.PI) / 180);
    const width = Math.ceil(((bbox.east - bbox.west) * kmLon * 1000) / stepMeters);
    const height = Math.ceil(((bbox.north - bbox.south) * KM_PER_DEG_LAT * 1000) / stepMeters);
    if (width > 65535 || height > 65535) throw new Error("Level too large for a 16-bit header");
    const keep = dilate(rasterize(selected, bbox, width, height), width, height, Math.ceil((BUFFER_KM * 1000) / stepMeters));
    const land = rasterize(japan, bbox, width, height);
    const z = zoomFor(stepMeters, midLat);
    const tiles = await loadTiles(bbox, z);
    const elevation = new Int16Array(width * height).fill(NODATA);
    for (let y = 0; y < height; y++) {
      const lat = bbox.north - ((y + 0.5) / height) * (bbox.north - bbox.south);
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!keep[i]) continue;
        const lon = bbox.west + ((x + 0.5) / width) * (bbox.east - bbox.west);
        elevation[i] = terrariumAt(tiles, z, lon, lat);
      }
    }
    const file = `${bundle}-${stepMeters}m${SOURCE === "terrarium" ? "" : `-${SOURCE}`}.bin`;
    const dest = path.join(OUT_DIR, file);
    fs.writeFileSync(dest, encodeRaster(bbox, width, height, elevation, land));
    const bytes = fs.statSync(dest).size;
    console.log("wrote", file, `${width}x${height}`, `z${z}`, `${tiles.size} tiles`, bytes, "bytes", sha256(dest));
    levels.push({ stepMeters, file, width, height, zoom: z, bytes, ...bbox });
  }

  // Levels of 500 m and coarser are distributed (manifest.json, committed). Finer levels are
  // local-only (manifest.local.json, Git-ignored). One entry per prefectures × levels × source.
  const write = (file, subset) => {
    if (!subset.length) return;
    const manifestPath = path.join(OUT_DIR, file);
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { bundles: [] };
    const id = `${bundle}@${subset.map(level => level.stepMeters).join(",")}${SOURCE === "terrarium" ? "" : `-${SOURCE}`}`;
    manifest.bundles = manifest.bundles.filter(entry => entry.id !== id);
    manifest.bundles.push({ id, prefectures: PREFS, source: SOURCE, levels: subset });
    manifest.bundles.sort((a, b) => a.id.localeCompare(b.id));
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log("manifest", path.relative(ROOT, manifestPath));
  };
  write("manifest.json", levels.filter(level => level.stepMeters >= 500));
  write("manifest.local.json", levels.filter(level => level.stepMeters < 500));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
