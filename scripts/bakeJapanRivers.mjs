#!/usr/bin/env node
/**
 * Bake real Japanese rivers for the local war terrain (docs/plan/japan-local-war-terrain.md).
 *
 * Source: GSI vector tiles (experimental_bvmap), layer `river` at z8 — Global Map Japan rivers
 * (1:1,000,000). Licence: GSI content terms / Public Data License v1.0; credit
 * 「国土地理院ベクトルタイル（地球地図日本）」. Tiles are cached in temp/gsi-bvmap-cache/.
 *
 * Output: public/heightmaps/earth/japan-local/rivers.json (Git-ignored while tuning):
 *   { source, zoom, rivers: [{ code, points: [[lon, lat], ...] }] }
 * Lines stay split at tile edges; the runtime draws and carves each piece on its own.
 *
 * Usage: node scripts/bakeJapanRivers.mjs [--zoom 8]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN1 = path.join(ROOT, "temp/japan-local/ne_10m_admin_1_states_provinces.geojson");
const CACHE = path.join(ROOT, "temp/gsi-bvmap-cache");
const OUT = path.join(ROOT, "public/heightmaps/earth/japan-local/rivers.json");
const ZOOM = Number(process.argv.includes("--zoom") ? process.argv[process.argv.indexOf("--zoom") + 1] : 8);
// JAPAN_REGION (src/data/earthRegions.ts): rivers outside the map are not needed.
const REGION = { west: 118.5, east: 146.4, south: 29.9, north: 46.6 };

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      })
      .on("error", reject);
  });
}

function tileXY(lon, lat, z) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

function tileToLonLat(x, y, z) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lon, lat];
}

/** Minimal protobuf reader for Mapbox Vector Tiles. */
function* fields(buf, start = 0, end = buf.length) {
  let p = start;
  const varint = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = buf[p++];
      result += (byte & 127) * 2 ** shift;
      shift += 7;
    } while (byte & 128);
    return result;
  };
  while (p < end) {
    const key = varint();
    const field = Math.floor(key / 8);
    const type = key & 7;
    if (type === 0) yield [field, varint()];
    else if (type === 2) {
      const length = varint();
      yield [field, [p, p + length]];
      p += length;
    } else if (type === 5) {
      yield [field, buf.readFloatLE(p)];
      p += 4;
    } else if (type === 1) {
      yield [field, buf.readDoubleLE(p)];
      p += 8;
    } else throw new Error(`Unsupported wire type ${type}`);
  }
}

function packedVarints(buf, [start, end]) {
  const out = [];
  let p = start;
  while (p < end) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = buf[p++];
      result += (byte & 127) * 2 ** shift;
      shift += 7;
    } while (byte & 128);
    out.push(result);
  }
  return out;
}

const zigzag = n => (n % 2 ? -(n + 1) / 2 : n / 2);

function decodeLines(geometry) {
  const lines = [];
  let x = 0;
  let y = 0;
  let line = null;
  for (let i = 0; i < geometry.length; ) {
    const command = geometry[i] & 7;
    const count = geometry[i] >> 3;
    i++;
    if (command === 7) continue;
    for (let k = 0; k < count; k++) {
      x += zigzag(geometry[i++]);
      y += zigzag(geometry[i++]);
      if (command === 1) {
        line = [[x, y]];
        lines.push(line);
      } else line?.push([x, y]);
    }
  }
  return lines.filter(l => l.length >= 2);
}

function readValue(buf, range) {
  for (const [field, value] of fields(buf, ...range)) {
    if (field === 1) return buf.toString("utf8", ...value);
    return value;
  }
  return undefined;
}

function riversInTile(buf, tx, ty, z) {
  const out = [];
  for (const [field, range] of fields(buf)) {
    if (field !== 3) continue;
    let name = "";
    let extent = 4096;
    const keys = [];
    const values = [];
    const features = [];
    for (const [f, v] of fields(buf, ...range)) {
      if (f === 1) name = buf.toString("utf8", ...v);
      else if (f === 2) features.push(v);
      else if (f === 3) keys.push(buf.toString("utf8", ...v));
      else if (f === 4) values.push(readValue(buf, v));
      else if (f === 5) extent = v;
    }
    if (name !== "river") continue;
    for (const feature of features) {
      let type = 0;
      let tags = [];
      let geometry = [];
      for (const [f, v] of fields(buf, ...feature)) {
        if (f === 2) tags = packedVarints(buf, v);
        else if (f === 3) type = v;
        else if (f === 4) geometry = packedVarints(buf, v);
      }
      if (type !== 2) continue;
      const props = {};
      for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = values[tags[i + 1]];
      for (const line of decodeLines(geometry)) {
        out.push({
          code: props.ftCode ?? null,
          points: line.map(([px, py]) =>
            tileToLonLat(tx + px / extent, ty + py / extent, z).map(v => Math.round(v * 1e5) / 1e5)
          )
        });
      }
    }
  }
  return out;
}

async function main() {
  const japan = JSON.parse(fs.readFileSync(ADMIN1, "utf8")).features.filter(f => f.properties.adm0_a3 === "JPN");
  // Tiles touching any prefecture bbox inside the map region.
  const wanted = new Set();
  for (const feature of japan) {
    const polys =
      feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const poly of polys) {
      let west = Infinity;
      let east = -Infinity;
      let south = Infinity;
      let north = -Infinity;
      for (const [lon, lat] of poly[0]) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
      if (east < REGION.west || west > REGION.east || north < REGION.south || south > REGION.north) continue;
      const a = tileXY(west, north, ZOOM);
      const b = tileXY(east, south, ZOOM);
      for (let x = Math.floor(a.x); x <= Math.floor(b.x); x++)
        for (let y = Math.floor(a.y); y <= Math.floor(b.y); y++) wanted.add(`${x},${y}`);
    }
  }
  fs.mkdirSync(CACHE, { recursive: true });
  const rivers = [];
  let fetched = 0;
  for (const key of wanted) {
    const [x, y] = key.split(",").map(Number);
    const file = path.join(CACHE, `${ZOOM}-${x}-${y}.pbf`);
    if (!fs.existsSync(file)) {
      const res = await get(`https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/${ZOOM}/${x}/${y}.pbf`);
      fetched++;
      fs.writeFileSync(file, res.status === 200 ? res.body : Buffer.alloc(0));
    }
    const buf = fs.readFileSync(file);
    if (buf.length) rivers.push(...riversInTile(buf, x, y, ZOOM));
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const json = JSON.stringify({ source: "gsi-experimental_bvmap-river", zoom: ZOOM, rivers });
  fs.writeFileSync(OUT, json);
  const points = rivers.reduce((sum, river) => sum + river.points.length, 0);
  const sha = crypto.createHash("sha256").update(json).digest("hex");
  console.log(`tiles ${wanted.size} (fetched ${fetched}), lines ${rivers.length}, points ${points}`);
  console.log("wrote", path.relative(ROOT, OUT), json.length, "bytes", sha);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
