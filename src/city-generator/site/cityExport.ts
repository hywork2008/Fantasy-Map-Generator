// City Generator — "share this city with an AI" export.
//
// One self-contained JSON blob:
//   • settings — everything that produced the town. `settings.resolved`
//     ({ params, geography, program }) fed straight back to `generateCity` (see
//     core/pipeline.ts) reproduces it byte-for-byte in either mode;
//     `settings.descriptor` is the upstream BurgSiteDescriptor those were derived
//     from (siteInput.ts).
//   • description — plain-language lines an assistant can read at a glance.
//   • city — a readable DIGEST of the generated plan: dimensions, cell-tag
//     tally, the walked river centre-lines, the shoreline, the wall loops, the
//     gates and the reserved precincts.
//
// Deliberately omits the raw Voronoi mesh (`gridStages` / `steps` / `cells`):
// thousands of polygons, useless as chat context and fully reproducible from
// `settings.resolved`.

import { polylineLength, vecToAzimuth } from "../core/geom";
import type {
  BorderLoop,
  CityGeography,
  CityParams,
  CityProgram,
  GenerationResult,
  Point,
  WallSegmentKind
} from "../core/types";
import { type BurgSiteArchetype, type BurgSiteDescriptor, DESCRIPTOR_VERSION } from "./burgSiteDescriptor";
import type { IncomingOrigin } from "./incomingSite";
import { PRESETS, type PresetId, presetPopulation } from "./presets";
import type { SiteConfig } from "./siteConfig";

export const CITY_EXPORT_KIND = "fmg-city-generator/city-export";
export const CITY_EXPORT_VERSION = 1;

const PROGRAM_FLAGS = ["walls", "citadel", "plaza", "temple", "port", "shanty", "capital"] as const;
const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** What the page hands the builder — the live state plus the resolved pipeline
 * inputs (`built` in CityGeneratorPage.ts). Nothing is re-generated here. */
export interface CityExportSource {
  mode: { kind: "standalone"; preset: PresetId; config: SiteConfig } | { kind: "imported"; origin: IncomingOrigin };
  seed: string;
  /** The descriptor fed to the pipeline — real when imported, fabricated by
   * `synthSite` when standalone. */
  descriptor: BurgSiteDescriptor;
  params: CityParams;
  geography: CityGeography;
  program: CityProgram;
  result: GenerationResult;
  /** Shareable `city/#…` link, when one applies (imported mode). */
  link?: string | null;
  /** Defaults to `new Date()` — injectable so tests stay deterministic. */
  now?: Date;
}

export interface CityExportSettings {
  mode: "standalone" | "imported";
  seed: string;
  /** standalone only. */
  preset?: { id: PresetId; label: string; population: number };
  /** standalone only — the composable site controls, verbatim. */
  siteConfig?: SiteConfig;
  /** imported only. */
  origin?: IncomingOrigin;
  /** imported only — a `city/#…` link that reopens this exact geography. */
  shareableLink?: string | null;
  descriptor: BurgSiteDescriptor;
  descriptorIsSynthetic: boolean;
  /** Exact, unrounded pipeline inputs. `generateCity(params, geography, program)`
   * reproduces `city` byte-for-byte. */
  resolved: {
    params: CityParams;
    geography: CityGeography;
    program: CityProgram;
  };
}

export interface CityRiverDigest {
  index: number;
  cityBank: "left" | "right";
  channelLengthMeters: number;
  widthMeters: { min: number; mean: number; max: number };
  source: Point;
  mouth: Point;
  /** Walked + smoothed centre-line, upstream → mouth, local metres. */
  points: Point[];
  widths: number[];
}

export interface CityWallLoopDigest {
  perimeterMeters: number;
  vertexCount: number;
  urbanCellCount: number;
  segmentKinds: Record<WallSegmentKind, number>;
  points: Point[];
  segments: WallSegmentKind[];
}

export interface CityDigest {
  dimensions: {
    extentMeters: number;
    cityRadiusMeters: number;
    cellSizeMeters: number;
    lloydPasses: number;
    cellCount: number;
  };
  suggestedArchetype: BurgSiteArchetype;
  cellTags: { sea: number; urban: number; outskirts: number; rural: number; total: number };
  stages: { gridStageCount: number; stepCount: number; stepLabels: string[] };
  coast: {
    waterAzimuthDeg: number;
    compass: string;
    seaCells: number;
    /** Graph-walked coast line, local metres. */
    shoreline: Point[];
  } | null;
  rivers: CityRiverDigest[];
  walls: { loopCount: number; loops: CityWallLoopDigest[] };
  gates: { point: Point; bearingDeg: number; compass: string; water: boolean }[];
  precincts: { kind: string; label: string; anchor: Point; cellCount: number }[];
}

export interface CityExport {
  kind: typeof CITY_EXPORT_KIND;
  exportVersion: number;
  descriptorVersion: number;
  generatedAt: string;
  generator: string;
  about: string;
  description: string[];
  settings: CityExportSettings;
  city: CityDigest;
}

/** Assemble the shareable payload from the page's current state. Pure. */
export function buildCityExport(src: CityExportSource): CityExport {
  const now = src.now ?? new Date();
  const m = src.mode;

  const settings: CityExportSettings = {
    mode: m.kind,
    seed: src.seed,
    descriptor: src.descriptor,
    descriptorIsSynthetic: m.kind === "standalone",
    resolved: { params: src.params, geography: src.geography, program: src.program }
  };
  if (m.kind === "standalone") {
    settings.preset = {
      id: m.preset,
      label: PRESETS.find(p => p.id === m.preset)?.label ?? m.preset,
      population: presetPopulation(m.preset)
    };
    settings.siteConfig = m.config;
  } else {
    settings.origin = m.origin;
    settings.shareableLink = src.link ?? null;
  }

  const city = digestCity(src.descriptor, src.params, src.geography, src.result);

  return {
    kind: CITY_EXPORT_KIND,
    exportVersion: CITY_EXPORT_VERSION,
    descriptorVersion: DESCRIPTOR_VERSION,
    generatedAt: now.toISOString(),
    generator: "Fantasy Map Generator — City Generator",
    about:
      "Feed settings.resolved.{params, geography, program} to generateCity() to reproduce this town exactly; " +
      "settings.descriptor is the upstream BurgSiteDescriptor those were derived from. " +
      "The raw Voronoi mesh is omitted. Coordinates are local metres: origin = town centre, +X = east, " +
      "+Y = north; azimuths are compass degrees (0 = north, 90 = east).",
    description: describeCity(settings, city),
    settings,
    city
  };
}

/** `fmg-city-<name>-<seed>.json`, slugified. */
export function cityExportFilename(data: CityExport): string {
  const rawName =
    data.settings.mode === "imported" ? data.settings.descriptor.burg.name : (data.settings.preset?.label ?? "city");
  const name = slug(rawName) || "city";
  const seed = slug(data.settings.seed) || "noseed";
  return `fmg-city-${name}-${seed}.json`;
}

// --- digest ------------------------------------------------------------------

function digestCity(
  descriptor: BurgSiteDescriptor,
  params: CityParams,
  geo: CityGeography,
  result: GenerationResult
): CityDigest {
  const finalCells = result.steps[result.steps.length - 1]?.cells ?? [];
  const cellTags = { sea: 0, urban: 0, outskirts: 0, rural: 0, total: finalCells.length };
  for (const c of finalCells) {
    if (c.tag === "sea") cellTags.sea++;
    else if (c.tag === "urban") cellTags.urban++;
    else if (c.tag === "outskirts") cellTags.outskirts++;
    else if (c.tag === "rural") cellTags.rural++;
  }

  const coastAz = geo.coast?.waterAzimuthDeg ?? 0;
  const coast =
    geo.coast && result.shoreline
      ? {
          waterAzimuthDeg: round1(coastAz),
          compass: compass8(coastAz),
          seaCells: cellTags.sea,
          shoreline: result.shoreline.map(roundPoint)
        }
      : null;

  const rivers: CityRiverDigest[] = result.riverPaths.map((r, i) => ({
    index: i + 1,
    cityBank: r.cityBank,
    channelLengthMeters: Math.round(polylineLength(r.points)),
    widthMeters: {
      min: round1(min(r.widths)),
      mean: round1(mean(r.widths)),
      max: round1(max(r.widths))
    },
    source: roundPoint(r.points[0] ?? [0, 0]),
    mouth: roundPoint(r.points[r.points.length - 1] ?? [0, 0]),
    points: r.points.map(roundPoint),
    widths: r.widths.map(round1)
  }));

  const gates = result.gates.map(g => {
    const bearing = vecToAzimuth(g.point[0], g.point[1]);
    return { point: roundPoint(g.point), bearingDeg: round1(bearing), compass: compass8(bearing), water: g.water };
  });

  return {
    dimensions: {
      extentMeters: Math.round(params.extentMeters),
      cityRadiusMeters: Math.round(params.cityRadiusMeters),
      cellSizeMeters: round1(params.cellSizeMeters),
      lloydPasses: params.lloydPasses,
      cellCount: result.cells.length
    },
    suggestedArchetype: descriptor.suggestedArchetype,
    cellTags,
    stages: {
      gridStageCount: result.gridStages.length,
      stepCount: result.steps.length,
      stepLabels: result.steps.map(s => s.label)
    },
    coast,
    rivers,
    walls: { loopCount: result.borders.length, loops: result.borders.map(loopDigest) },
    gates,
    precincts: result.precincts.map(p => ({
      kind: p.kind,
      label: p.label,
      anchor: roundPoint(p.anchor),
      cellCount: p.cellIds.length
    }))
  };
}

function loopDigest(loop: BorderLoop): CityWallLoopDigest {
  const segmentKinds: Record<WallSegmentKind, number> = { land: 0, coast: 0, river: 0, citadel: 0 };
  for (const k of loop.segments) segmentKinds[k]++;
  return {
    perimeterMeters: Math.round(closedLength(loop.points)),
    vertexCount: loop.points.length,
    urbanCellCount: loop.urbanCellIds.length,
    segmentKinds,
    points: loop.points.map(roundPoint),
    segments: loop.segments
  };
}

// --- prose -----------------------------------------------------------------

function describeCity(settings: CityExportSettings, city: CityDigest): string[] {
  const lines: string[] = [];
  const b = settings.descriptor.burg;

  if (settings.mode === "standalone") {
    const pop = settings.preset?.population ?? b.population;
    lines.push(
      `Standalone city — size "${settings.preset?.label ?? "?"}" (~${pop.toLocaleString()} inhabitants), ` +
        `seed "${settings.seed}".`
    );
  } else {
    lines.push(
      `Imported from the FMG world map${settings.origin === "link" ? " via a shared link" : ""} — ` +
        `burg "${b.name || "(unnamed)"}" (id ${b.id}), type ${b.type || "?"}${b.capital ? ", capital" : ""}, ` +
        `population ${b.population.toLocaleString()}, seed "${settings.seed}".`
    );
  }

  const d = city.dimensions;
  lines.push(
    `Generation window ${d.extentMeters} m square; built-up radius ${d.cityRadiusMeters} m; ` +
      `${d.cellCount} macro Voronoi cells (~${d.cellSizeMeters} m each, ${d.lloydPasses} Lloyd passes).`
  );
  lines.push(`Suggested archetype: ${city.suggestedArchetype}.`);

  lines.push(
    city.coast
      ? `Coastal — open water lies to the ${city.coast.compass} (azimuth ${city.coast.waterAzimuthDeg}°); ` +
          `${city.coast.seaCells} sea cells; shoreline traced with ${city.coast.shoreline.length} points.`
      : "Landlocked — no coastline."
  );

  if (city.rivers.length === 0) {
    lines.push("No rivers within the window.");
  } else {
    for (const r of city.rivers) {
      lines.push(
        `River ${r.index}: town sits on the ${r.cityBank} bank; ~${r.widthMeters.mean} m wide ` +
          `(${r.widthMeters.min}–${r.widthMeters.max} m); ${r.channelLengthMeters} m of channel in the window.`
      );
    }
  }

  const p = settings.resolved.program;
  const feats = PROGRAM_FLAGS.filter(k => p[k]);
  lines.push(feats.length ? `Built programme: ${feats.join(", ")}.` : "Open settlement — nothing built.");

  if (city.walls.loopCount > 0) {
    const waterGates = city.gates.filter(g => g.water).length;
    const gateBits =
      city.gates.length === 0
        ? "no gates"
        : `${city.gates.length} gate${plural(city.gates.length)}` +
          (waterGates ? ` (incl. ${waterGates} water gate${plural(waterGates)})` : "");
    lines.push(
      `${city.walls.loopCount} inner perimeter loop${plural(city.walls.loopCount)} ` +
        `(${city.walls.loops.map(l => `${l.vertexCount} pts`).join(", ")}); ${gateBits}.`
    );
  }

  if (city.precincts.length > 0) {
    lines.push(`Reserved precincts: ${city.precincts.map(pr => pr.label || pr.kind).join(", ")}.`);
  }

  lines.push(
    `Cell classification — urban ${city.cellTags.urban}, outskirts ${city.cellTags.outskirts}, ` +
      `rural ${city.cellTags.rural}, sea ${city.cellTags.sea} (of ${city.cellTags.total}).`
  );

  return lines;
}

// --- helpers -------------------------------------------------------------------

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compass8(azimuthDeg: number): string {
  const idx = Math.round(((((azimuthDeg % 360) + 360) % 360) / 45) % 8) % 8;
  return COMPASS_8[idx];
}

function closedLength(poly: Point[]): number {
  if (poly.length < 2) return 0;
  const a = poly[poly.length - 1];
  const b = poly[0];
  return polylineLength(poly) + Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

function min(xs: number[]): number {
  return xs.length ? Math.min(...xs) : 0;
}

function max(xs: number[]): number {
  return xs.length ? Math.max(...xs) : 0;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function roundPoint(p: Point): Point {
  return [round1(p[0]), round1(p[1])];
}
