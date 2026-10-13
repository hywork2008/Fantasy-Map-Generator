#!/usr/bin/env node
// River-Port Lab: flattens lab:collect NDJSON (collected with --include descriptor) into one CSV row
// per burg — population, CE town radius, settlement kind, CE map size and water distances — for
// sizing the waterfront rule (docs/plan/waterfront-town-proximity.md).
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

const usage = "Usage: npm run lab:csv -- --out burgs.csv <run.ndjson>[=label] ...   (label defaults to the file name)";
const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? resolve(args.splice(outAt, 2)[1]) : null;
if (!out || !args.length || args.includes("--help")) {
  console.log(usage);
  process.exit(out && args.length ? 0 : 1);
}

// Mirrors CITY_SIZE_PRESETS (src/city-editor/generators/document.ts); keep in sync.
const PRESETS = [
  ["micro", 300],
  ["tiny", 600],
  ["small", 1200],
  ["medium", 2400],
  ["large", 4800]
];
const nearestPreset = extent => PRESETS.reduce((best, p) => (Math.abs(p[1] - extent) < Math.abs(best[1] - extent) ? p : best))[0];
const presetExtent = name => PRESETS.find(p => p[0] === name)[1];
/** The smallest preset whose window holds a square of this side. */
const presetHolding = side => (PRESETS.find(p => p[1] >= side) ?? PRESETS.at(-1))[0];
/** fitUndersizedTownFrame: the Map size CE picks when FMG's window is far larger than the town. */
function fittedSize(radius, extent) {
  if (!(radius > 0) || extent <= radius * 6 * 1.25) return null;
  let i = PRESETS.findIndex(p => p[0] === nearestPreset(radius / 0.33));
  while (i < PRESETS.length - 1 && PRESETS[i][1] < radius * 2.5) i++;
  return PRESETS[i][0];
}

const segDist = (a, b) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, (-a[0] * dx - a[1] * dy) / len)) : 0;
  return Math.hypot(a[0] + dx * t, a[1] + dy * t);
};
/** Distance from the town centre (origin) to the nearest bank polyline in the descriptor window. */
function bankPolylineDistance(river) {
  let best = Infinity;
  for (const line of [...(river.leftBankSegments ?? []), ...(river.rightBankSegments ?? [])])
    for (let i = 1; i < line.length; i++) best = Math.min(best, segDist(line[i - 1], line[i]));
  return best;
}

const COLUMNS = [
  "source", "seed", "burg_id", "name", "kind", "capital", "walls", "citadel", "plaza", "temple", "shanty",
  "population", "dwellings", "radius_m", "diameter_m", "area_ha", "radius_at_floor_40m", "two_r_m", "side_4r_m",
  "fmg_window_m", "fmg_window_preset", "ce_size_fitted", "ce_size_fitted_extent_m", "ce_size_holding_4r", "town_share_of_fitted_window",
  "site_kind", "intended_kind", "sea_port", "river_port", "lake_port", "port_flag",
  "river_id", "river_width_m", "river_flux", "river_site_status", "river_bank_distance_m", "river_bank_over_r", "river_polyline_bank_m", "river_coast_constrained",
  "shore_distance_m", "shore_over_r", "nearest_water_m", "nearest_water_over_r", "water_within_2r",
  "waterfront_ok", "waterfront_issues", "cell_scale_m_per_map_unit"
];
const cell = v => {
  if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return "";
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  const text = String(v);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const stream = createWriteStream(out);
stream.write(`${COLUMNS.join(",")}\n`);
let rows = 0,
  skipped = 0;
for (const spec of args) {
  const [path, label = spec.split("/").pop()] = spec.split("=");
  for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const { map, burg: b } = JSON.parse(line);
    const d = b.descriptor;
    if (!d?.frame || !d.burg) {
      skipped++;
      continue;
    }
    const db = d.burg,
      R = d.frame.cityRadiusMeters,
      extent = d.frame.extentMeters;
    const rp = db.riverPlacement;
    const river = (d.rivers ?? []).find(r => r.riverId === (rp?.riverId ?? b.river?.id));
    const fitted = fittedSize(R, extent);
    const fittedExtent = fitted ? presetExtent(fitted) : null;
    const status = db.riverSiteStatus?.status ?? "";
    const bank = rp?.bankDistanceMeters;
    const shore = d.waterbody?.shoreDistanceMeters;
    const distances = [];
    if (b.riverPort && bank !== undefined) distances.push(bank);
    if ((b.seaPort || b.lakePort) && shore !== undefined) distances.push(shore);
    const nearest = distances.length ? Math.min(...distances) : null;
    const issues = (b.waterfrontCheck?.alerts ?? []).map(a => a.kind + (a.reason ? `:${a.reason}` : "")).join(";");
    const row = {
      source: label, seed: map.seed, burg_id: b.id, name: b.name, kind: db.group, capital: db.capital ? 1 : 0,
      walls: db.walls ? 1 : 0, citadel: db.citadel ? 1 : 0, plaza: db.plaza ? 1 : 0, temple: db.temple ? 1 : 0, shanty: db.shanty ? 1 : 0,
      population: db.population, dwellings: db.dwellings, radius_m: R, diameter_m: 2 * R,
      area_ha: (Math.PI * R * R) / 10000, radius_at_floor_40m: R <= 40 ? 1 : 0, two_r_m: 2 * R, side_4r_m: 4 * R,
      fmg_window_m: extent, fmg_window_preset: nearestPreset(extent), ce_size_fitted: fitted, ce_size_fitted_extent_m: fittedExtent,
      ce_size_holding_4r: presetHolding(4 * R), town_share_of_fitted_window: fittedExtent ? (Math.PI * R * R) / (fittedExtent * fittedExtent) : null,
      site_kind: b.siteKindActual, intended_kind: b.siteKindIntended, sea_port: b.seaPort ? 1 : 0, river_port: b.riverPort ? 1 : 0,
      lake_port: b.lakePort ? 1 : 0, port_flag: b.port ? 1 : 0,
      river_id: b.river?.id, river_width_m: river?.widthMeters ?? rp?.widthMeters, river_flux: b.river?.flux, river_site_status: status,
      river_bank_distance_m: bank, river_bank_over_r: bank !== undefined ? bank / R : null,
      river_polyline_bank_m: river ? bankPolylineDistance(river) : null, river_coast_constrained: rp?.coastConstrained ? 1 : 0,
      shore_distance_m: shore, shore_over_r: shore !== undefined ? shore / R : null,
      nearest_water_m: nearest, nearest_water_over_r: nearest !== null ? nearest / R : null,
      water_within_2r: nearest === null ? "" : nearest <= 2 * R ? 1 : 0,
      waterfront_ok: b.waterfrontCheck?.ok ? 1 : 0, waterfront_issues: issues, cell_scale_m_per_map_unit: d.frame.metersPerMapUnit
    };
    stream.write(`${COLUMNS.map(c => cell(row[c])).join(",")}\n`);
    rows++;
  }
}
await new Promise(done => stream.end(done));
console.error(`[lab:csv] ${rows} rows → ${out}${skipped ? ` (${skipped} burgs without a descriptor skipped)` : ""}`);
