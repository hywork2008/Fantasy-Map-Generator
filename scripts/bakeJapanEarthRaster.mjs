#!/usr/bin/env node
/**
 * Bake the Japan EarthRegion raster: four home islands only
 * (Honshu, Hokkaido, Kyushu, Shikoku) plus GMTED/ETOPO elevation.
 *
 * Usage: node scripts/bakeJapanEarthRaster.mjs
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public/heightmaps/earth");
const TILE_DIR = "/tmp/terrarium-japan-home";
const NE_PATHS = [
  "/tmp/ne-japan/ne10.json",
  path.join(ROOT, "temp/ne_10m_admin_0_countries.geojson")
];

const WEST = 129.2;
const EAST = 145.82;
const SOUTH = 30.95;
const NORTH = 45.55;
const DEG = 0.02;
const WIDTH = Math.round((EAST - WEST) / DEG);
const HEIGHT = Math.round((NORTH - SOUTH) / DEG);
const NODATA = -32768;
const MAGIC = 0x45474d46;
const VERSION = 1;
const MAIN_ISLANDS = 4;

function loadCountries() {
  for (const candidate of NE_PATHS) {
    if (fs.existsSync(candidate)) {
      console.log("countries", candidate);
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    }
  }
  throw new Error("Natural Earth 10m countries GeoJSON not found.");
}

function isoOf(feature) {
  const p = feature.properties ?? {};
  return p.ADM0_A3 || p.ISO_A3 || p.iso_a3 || "";
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

function japanMainIslands(features) {
  const japan = features.find(f => isoOf(f) === "JPN");
  if (!japan) throw new Error("JPN feature missing from Natural Earth");
  const geom = japan.geometry;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const ranked = polys
    .map(poly => ({ poly, area: ringArea(poly[0]) }))
    .sort((a, b) => b.area - a.area);
  const chosen = ranked.slice(0, MAIN_ISLANDS);
  console.log(
    "islands",
    chosen.map((c, i) => `#${i} area=${c.area.toFixed(3)} rings=${c.poly.length}`)
  );
  return chosen.map(c => c.poly);
}

function rasterizeLand(polygons) {
  const land = new Uint8Array(WIDTH * HEIGHT);
  const px = lon => ((lon - WEST) / (EAST - WEST)) * WIDTH;
  const py = lat => ((NORTH - lat) / (NORTH - SOUTH)) * HEIGHT;
  for (const poly of polygons) {
    const buckets = Array.from({ length: HEIGHT }, () => []);
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        let x0 = px(ring[i][0]);
        let y0 = py(ring[i][1]);
        let x1 = px(ring[i + 1][0]);
        let y1 = py(ring[i + 1][1]);
        if (y0 === y1) continue;
        if (y0 > y1) {
          const tx = x0;
          x0 = x1;
          x1 = tx;
          const ty = y0;
          y0 = y1;
          y1 = ty;
        }
        const dx = (x1 - x0) / (y1 - y0);
        const yStart = Math.max(0, Math.ceil(y0 - 1e-9));
        const yEnd = Math.min(HEIGHT - 1, Math.floor(y1 - 1e-9));
        for (let y = yStart; y <= yEnd; y++) buckets[y].push(x0 + (y + 0.5 - y0) * dx);
      }
    }
    for (let y = 0; y < HEIGHT; y++) {
      const xs = buckets[y];
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const a = Math.max(0, Math.ceil(xs[i]));
        const b = Math.min(WIDTH - 1, Math.floor(xs[i + 1]));
        for (let x = a; x <= b; x++) land[y * WIDTH + x] = 1;
      }
    }
  }
  console.log("land px", land.reduce((s, v) => s + v, 0), `${WIDTH}x${HEIGHT}`);
  return land;
}

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

function tileXY(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

function elevFromTile(png, px, py) {
  const i = (py * png.width + px) * 4;
  return png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
}

async function loadTiles(z) {
  fs.mkdirSync(TILE_DIR, { recursive: true });
  const nw = tileXY(WEST, NORTH, z);
  const se = tileXY(EAST, SOUTH, z);
  const tiles = new Map();
  for (let x = Math.floor(nw.x); x <= Math.floor(se.x); x++) {
    for (let y = Math.floor(nw.y); y <= Math.floor(se.y); y++) {
      const dest = path.join(TILE_DIR, `${z}-${x}-${y}.png`);
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
        const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
        console.log("GET", url);
        await download(url, dest);
      }
      tiles.set(`${x},${y}`, PNG.sync.read(fs.readFileSync(dest)));
    }
  }
  return { tiles, z };
}

function sampleTerrarium(tiles, z, lon, lat) {
  const { x, y } = tileXY(lon, lat, z);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const tile = tiles.get(`${tx},${ty}`);
  if (!tile) return NODATA;
  const px = Math.min(255, Math.max(0, Math.floor((x - tx) * 256)));
  const py = Math.min(255, Math.max(0, Math.floor((y - ty) * 256)));
  const elev = Math.round(elevFromTile(tile, px, py));
  if (!Number.isFinite(elev)) return NODATA;
  return Math.max(-500, Math.min(9000, elev));
}

function encodeRaster(land, elevation) {
  const elevBytes = WIDTH * HEIGHT * 2;
  const landBytes = Math.ceil((WIDTH * HEIGHT) / 8);
  const out = new Uint8Array(28 + elevBytes + landBytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, WIDTH, true);
  view.setUint16(8, HEIGHT, true);
  view.setFloat32(10, WEST, true);
  view.setFloat32(14, EAST, true);
  view.setFloat32(18, SOUTH, true);
  view.setFloat32(22, NORTH, true);
  out.set(new Uint8Array(elevation.buffer), 28);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    if (land[i]) out[28 + elevBytes + (i >> 3)] |= 1 << (i & 7);
  }
  return out;
}

async function main() {
  const countries = loadCountries();
  const islands = japanMainIslands(countries.features);
  const land = rasterizeLand(islands);
  const { tiles, z } = await loadTiles(7);
  const elevation = new Int16Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const lat = NORTH - (y + 0.5) * ((NORTH - SOUTH) / HEIGHT);
    for (let x = 0; x < WIDTH; x++) {
      const lon = WEST + (x + 0.5) * ((EAST - WEST) / WIDTH);
      elevation[y * WIDTH + x] = sampleTerrarium(tiles, z, lon, lat);
    }
    if (y % 80 === 0) console.log("elev row", y);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const packed = encodeRaster(land, elevation);
  const dest = path.join(OUT_DIR, "japan.bin");
  fs.writeFileSync(dest, packed);
  console.log("wrote", dest, packed.byteLength, `${WIDTH}x${HEIGHT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
