#!/usr/bin/env node
/**
 * Bake the Japan terrain tile pyramid (docs/plan/japan-terrain-tiles.md, T1).
 *
 * Re-samples rasters already on disk; nothing is downloaded:
 *   - public/heightmaps/earth/japan.bin (0.02°, ~2 km) for every level,
 *   - public/heightmaps/earth/japan-local/<pref>-<step>m.bin listed in manifest.json (and in
 *     manifest.local.json with --local) where they cover the sample.
 *
 * Tile frame: kilometres from the region's north-west corner, equirectangular at the region's
 * middle latitude (the same shape the map graph is fitted to). Level 0 tiles are `rootKm` wide;
 * each level halves the side. A tile is `samples × samples` points including both edges, so
 * neighbours share their edge row. Stored tiles carry one more sample on every side
 * (`border`), so the runtime shades the edge with the same neighbours as the next tile.
 *
 * Output: public/heightmaps/earth/japan-tiles/
 *   index.json        frame, levels, and per tile [x, y, offset, minM, maxM, prefIndexes, split]
 *                     split = 1 when every child inside Japan was baked (the runtime may refine)
 *   z<z>.bin          tiles of one level back to back, Int16 little-endian, 0.5 m units,
 *                     -32768 = no data. Tiles without land are not written.
 *
 * Tiles without land are dropped; from --fineFrom (default 2) on, so are tiles that touch no
 * Japanese prefecture, and tiles whose land is not mostly covered by a raster at least as fine
 * as the level (a 250 m level is only written where 250 m rasters exist).
 *
 *   index.local.json  levels finer than 500 m (Git-ignored; only with --local and --maxZoom > 3)
 *   prefectures.bin   prefecture index per 1 km cell of the frame (Uint8, 255 = none)
 *
 * Usage: node scripts/bakeJapanTiles.mjs [--maskOnly] [--maxZoom 3] [--rootKm 256] [--samples 65] [--fineFrom 2] [--local]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const EARTH = path.join(ROOT, "public/heightmaps/earth");
const LOCAL = path.join(EARTH, "japan-local");
const OUT = path.join(EARTH, "japan-tiles");
const ADMIN1 = path.join(ROOT, "temp/japan-local/ne_10m_admin_1_states_provinces.geojson");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const MAX_ZOOM = Number(arg("maxZoom", 3));
const ROOT_KM = Number(arg("rootKm", 256));
const SAMPLES = Number(arg("samples", 65));
// Levels from here on keep only tiles that touch a Japanese prefecture.
const FINE_FROM = Number(arg("fineFrom", 2));
// Share of a fine tile's land that must come from rasters at least as fine as the level.
const FINE_COVERAGE = 0.5;
const BORDER = 1;
// Rewrite only prefectures.bin and the mask entry of an existing index.json.
const MASK_ONLY = process.argv.includes("--maskOnly");
// Finest step written to the distributed index.json.
const DIST_MIN_STEP_M = 500;
const USE_LOCAL = process.argv.includes("--local");

// JAPAN_REGION (src/data/earthRegions.ts).
const REGION = { west: 118.5, east: 146.4, south: 29.9, north: 46.6 };
const MID_LAT = (REGION.south + REGION.north) / 2;
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32 * Math.cos((MID_LAT * Math.PI) / 180);
const WIDTH_KM = (REGION.east - REGION.west) * KM_PER_DEG_LON;
const HEIGHT_KM = (REGION.north - REGION.south) * KM_PER_DEG_LAT;
const NODATA = -32768;
const LAND_M = 0.5;

function decodeRaster(file) {
  const bytes = fs.readFileSync(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x45474d46) throw new Error(`bad magic: ${file}`);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const elevation = new Int16Array(width * height);
  elevation.set(new Int16Array(bytes.buffer.slice(bytes.byteOffset + 28, bytes.byteOffset + 28 + width * height * 2)));
  return {
    width,
    height,
    west: view.getFloat32(10, true),
    east: view.getFloat32(14, true),
    south: view.getFloat32(18, true),
    north: view.getFloat32(22, true),
    elevation
  };
}

/** Bilinear over valid neighbours; null where none of the four is valid or outside. */
function sample(r, lon, lat) {
  const fx = ((lon - r.west) / (r.east - r.west)) * r.width - 0.5;
  const fy = ((r.north - lat) / (r.north - r.south)) * r.height - 0.5;
  if (fx < 0 || fy < 0 || fx > r.width - 1 || fy > r.height - 1) return null;
  const x0 = Math.min(Math.floor(fx), r.width - 2);
  const y0 = Math.min(Math.floor(fy), r.height - 2);
  const tx = fx - x0;
  const ty = fy - y0;
  let sum = 0;
  let weight = 0;
  for (const [dx, dy, w] of [
    [0, 0, (1 - tx) * (1 - ty)],
    [1, 0, tx * (1 - ty)],
    [0, 1, (1 - tx) * ty],
    [1, 1, tx * ty]
  ]) {
    const v = r.elevation[(y0 + dy) * r.width + x0 + dx];
    if (v === NODATA || w === 0) continue;
    sum += v * w;
    weight += w;
  }
  return weight > 0.25 ? sum / weight : null;
}

function loadSources() {
  const sources = [];
  const manifests = ["manifest.json", ...(USE_LOCAL ? ["manifest.local.json"] : [])];
  for (const name of manifests) {
    const file = path.join(LOCAL, name);
    if (!fs.existsSync(file)) continue;
    for (const bundle of JSON.parse(fs.readFileSync(file, "utf8")).bundles)
      for (const level of bundle.levels) {
        const raster = path.join(LOCAL, level.file);
        if (fs.existsSync(raster)) sources.push({ stepMeters: level.stepMeters, raster: decodeRaster(raster) });
      }
  }
  sources.sort((a, b) => a.stepMeters - b.stepMeters);
  return sources;
}

function polygonsOf(geom) {
  if (!geom) return [];
  return geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
}

/** Prefecture index per 1 km cell of the frame (255 = none), by even-odd scanline fill. */
function prefectureGrid() {
  if (!fs.existsSync(ADMIN1)) return { codes: [], grid: null, width: 0, height: 0 };
  const features = JSON.parse(fs.readFileSync(ADMIN1, "utf8"))
    .features.filter(f => f.properties.adm0_a3 === "JPN")
    .sort((a, b) => a.properties.iso_3166_2.localeCompare(b.properties.iso_3166_2));
  const width = Math.ceil(WIDTH_KM);
  const height = Math.ceil(HEIGHT_KM);
  const grid = new Uint8Array(width * height).fill(255);
  const codes = features.map(f => f.properties.iso_3166_2);
  features.forEach((feature, index) => {
    for (const poly of polygonsOf(feature.geometry)) {
      const rows = Array.from({ length: height }, () => []);
      for (const ring of poly)
        for (let i = 0; i < ring.length - 1; i++) {
          let x0 = (ring[i][0] - REGION.west) * KM_PER_DEG_LON;
          let y0 = (REGION.north - ring[i][1]) * KM_PER_DEG_LAT;
          let x1 = (ring[i + 1][0] - REGION.west) * KM_PER_DEG_LON;
          let y1 = (REGION.north - ring[i + 1][1]) * KM_PER_DEG_LAT;
          if (y0 === y1) continue;
          if (y0 > y1) [x0, y0, x1, y1] = [x1, y1, x0, y0];
          const dx = (x1 - x0) / (y1 - y0);
          for (let y = Math.max(0, Math.ceil(y0 - 0.5)); y <= Math.min(height - 1, Math.floor(y1 - 0.5)); y++)
            rows[y].push(x0 + (y + 0.5 - y0) * dx);
        }
      for (let y = 0; y < height; y++) {
        const xs = rows[y].sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(width - 1, Math.floor(xs[k + 1] - 0.5)); x++)
            grid[y * width + x] = index;
      }
    }
  });
  return { codes, grid, width, height };
}

function main() {
  const t0 = performance.now();
  const base = decodeRaster(path.join(EARTH, "japan.bin"));
  const sources = loadSources();
  const prefs = prefectureGrid();
  fs.mkdirSync(OUT, { recursive: true });
  // Prefecture index per 1 km cell (255 = none) for the runtime's partial display.
  const mask = prefs.grid ? { file: "prefectures.bin", width: prefs.width, height: prefs.height, cellKm: 1 } : null;
  if (mask) {
    fs.writeFileSync(path.join(OUT, mask.file), prefs.grid);
    const sha = crypto.createHash("sha256").update(prefs.grid).digest("hex");
    console.log(`${mask.file} ${prefs.grid.length} bytes (gzip ${zlib.gzipSync(prefs.grid).length}) ${sha}`);
  }
  if (MASK_ONLY) {
    const indexPath = path.join(OUT, "index.json");
    const existing = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    existing.prefectures = prefs.codes;
    existing.prefectureMask = mask;
    const json = JSON.stringify(existing);
    fs.writeFileSync(indexPath, json);
    console.log(`index.json ${json.length} bytes ${crypto.createHash("sha256").update(json).digest("hex")}`);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const cols = Math.ceil(WIDTH_KM / ROOT_KM);
  const rows = Math.ceil(HEIGHT_KM / ROOT_KM);
  const levels = [];
  const files = [];
  // Tiles inside Japan left out for lack of fine rasters: their parent must not refine.
  const uncovered = new Set();

  for (let z = 0; z <= MAX_ZOOM; z++) {
    const sizeKm = ROOT_KM / 2 ** z;
    const spacingKm = sizeKm / (SAMPLES - 1);
    // Only sources at least as fine as the spacing; coarser ones would be upsampled noise-free anyway.
    const usable = sources.filter(s => s.stepMeters <= spacingKm * 1000);
    // Where no fine raster covers a point, the nearest coarser one beats japan.bin.
    const coarser = sources.filter(s => s.stepMeters > spacingKm * 1000);
    const stored = SAMPLES + 2 * BORDER;
    const nx = cols * 2 ** z;
    const ny = rows * 2 ** z;
    const tiles = [];
    const chunks = [];
    let offset = 0;
    const counts = { land: 0, local: 0 };
    const parents = new Set(levels[z - 1]?.tiles.map(([x, y]) => `${x}/${y}`) ?? []);
    for (let ty = 0; ty < ny; ty++)
      for (let tx = 0; tx < nx; tx++) {
        const x0 = tx * sizeKm;
        const y0 = ty * sizeKm;
        if (x0 >= WIDTH_KM || y0 >= HEIGHT_KM) continue;
        // Fine levels only refine tiles baked one level up (the rest is sea or outside Japan).
        if (z > FINE_FROM && !parents.has(`${tx >> 1}/${ty >> 1}`)) continue;
        const data = new Int16Array(stored * stored);
        let min = Infinity;
        let max = -Infinity;
        let land = false;
        const tileCounts = { land: 0, local: 0 };
        for (let j = 0; j < stored; j++) {
          const lat = REGION.north - (y0 + (j - BORDER) * spacingKm) / KM_PER_DEG_LAT;
          for (let i = 0; i < stored; i++) {
            const lon = REGION.west + (x0 + (i - BORDER) * spacingKm) / KM_PER_DEG_LON;
            let m = null;
            for (const s of usable) {
              m = sample(s.raster, lon, lat);
              if (m !== null) break;
            }
            const fromLocal = m !== null;
            for (const s of coarser) {
              if (m !== null) break;
              m = sample(s.raster, lon, lat);
            }
            if (m === null) m = sample(base, lon, lat);
            if (m === null) {
              data[j * stored + i] = NODATA;
              continue;
            }
            const inside = i >= BORDER && j >= BORDER && i < stored - BORDER && j < stored - BORDER;
            data[j * stored + i] = Math.max(-32767, Math.min(32767, Math.round(m * 2)));
            if (!inside) continue;
            if (m > LAND_M) {
              tileCounts.land++;
              if (fromLocal) tileCounts.local++;
            }
            min = Math.min(min, m);
            max = Math.max(max, m);
            if (m > LAND_M) land = true;
          }
        }
        if (!land) continue;
        const prefSet = new Set();
        if (prefs.grid)
          for (let y = Math.floor(y0); y < Math.min(prefs.height, Math.ceil(y0 + sizeKm)); y++)
            for (let x = Math.floor(x0); x < Math.min(prefs.width, Math.ceil(x0 + sizeKm)); x++) {
              const p = prefs.grid[y * prefs.width + x];
              if (p !== 255) prefSet.add(p);
            }
        // Neighbouring land (Korea, China, Russia) only at the coarse levels.
        if (z >= FINE_FROM && prefs.grid && !prefSet.size) continue;
        if (z >= FINE_FROM && tileCounts.local < tileCounts.land * FINE_COVERAGE) {
          uncovered.add(`${z}/${tx}/${ty}`);
          continue;
        }
        counts.land += tileCounts.land;
        counts.local += tileCounts.local;
        tiles.push([tx, ty, offset, Math.floor(min), Math.ceil(max), [...prefSet].sort((a, b) => a - b)]);
        chunks.push(Buffer.from(data.buffer));
        offset += data.byteLength;
      }
    const file = `z${z}.bin`;
    const body = Buffer.concat(chunks);
    fs.writeFileSync(path.join(OUT, file), body);
    const gzip = zlib.gzipSync(body, { level: 9 }).length;
    const sha = crypto.createHash("sha256").update(body).digest("hex");
    levels.push({ z, sizeKm, spacingKm, file, bytes: body.length, tiles });
    files.push({ file, bytes: body.length, gzip, tiles: tiles.length, sha });
    console.log(
      `z${z} ${sizeKm}km spacing ${(spacingKm * 1000).toFixed(0)}m: ${tiles.length} tiles, ${body.length} bytes (gzip ${gzip}),`,
      `land samples from prefecture rasters ${((counts.local / Math.max(1, counts.land)) * 100).toFixed(1)}%`
    );
  }

  for (const level of levels) {
    const baked = new Set(levels[level.z + 1]?.tiles.map(([x, y]) => `${x}/${y}`) ?? []);
    for (const tile of level.tiles) {
      const [x, y] = tile;
      const children = [
        [x * 2, y * 2],
        [x * 2 + 1, y * 2],
        [x * 2, y * 2 + 1],
        [x * 2 + 1, y * 2 + 1]
      ];
      const next = level.z + 1;
      const complete =
        next < levels.length &&
        children.some(([cx, cy]) => baked.has(`${cx}/${cy}`)) &&
        children.every(([cx, cy]) => !uncovered.has(`${next}/${cx}/${cy}`));
      tile.push(complete ? 1 : 0);
    }
  }

  // Levels of 500 m and coarser are distributed (index.json); finer ones stay local (index.local.json).
  const distributed = levels.filter(level => level.spacingKm * 1000 >= DIST_MIN_STEP_M - 1e-6);
  const local = levels.filter(level => level.spacingKm * 1000 < DIST_MIN_STEP_M - 1e-6);
  const index = {
    version: 2,
    region: REGION,
    frame: { kmPerDegLon: KM_PER_DEG_LON, kmPerDegLat: KM_PER_DEG_LAT, widthKm: WIDTH_KM, heightKm: HEIGHT_KM },
    rootKm: ROOT_KM,
    cols,
    rows,
    samples: SAMPLES,
    border: BORDER,
    unitMeters: 0.5,
    nodata: NODATA,
    prefectures: prefs.codes,
    prefectureMask: mask,
    levels: distributed
  };
  const write = (file, value) => {
    const json = JSON.stringify(value);
    fs.writeFileSync(path.join(OUT, file), json);
    const sha = crypto.createHash("sha256").update(json).digest("hex");
    console.log(`${file} ${json.length} bytes (gzip ${zlib.gzipSync(json).length}) ${sha}`);
  };
  write("index.json", index);
  const localPath = path.join(OUT, "index.local.json");
  if (local.length) write("index.local.json", { version: 2, levels: local });
  else if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  for (const f of files) console.log(f.file, f.sha);
  console.log(`done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

main();
