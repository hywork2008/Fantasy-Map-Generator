import type { GenerationSettings } from "../../types/generation";
import type { Point } from "../../types/primitives";
import type { PointTerrainPart, TerrainTemplateId } from "../../types/terrain";
import type { VectorCityDocument } from "../../types/vector/document";
import type {
  VectorEarthwork,
  VectorRelief,
  VectorReliefLatticePart,
  VectorReliefPart,
  VectorReliefPresetPart
} from "../../types/vector/relief";
import { elevationRotationDegrees, presetAmplitude } from "../elevationPreset";
import { makeRng } from "../prng";
import { isPointTerrainPart, partHeightAt } from "../terrainField/parts";
import { templateParts } from "../terrainField/templates";
import { samplePath } from "./geometry/sampling";

/** Natural relief of a meshless city (docs/plan/ce-meshless-natural-relief.md §4.2, §6.2). */

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

function presetHeight(part: VectorReliefPresetPart, point: Point): number {
  const dx = point[0] - part.center[0],
    dy = point[1] - part.center[1],
    cos = Math.cos(part.azimuthRadians),
    sin = Math.sin(part.azimuthRadians),
    half = Math.max(1, part.halfMeters),
    a = part.amplitudeMeters;
  if (part.preset === "slope") {
    // High ground upslope, easing into level land at both ends of the span.
    const along = (dx * cos + dy * sin) / half;
    return a * (1 - smoothstep((along + 1) / 2));
  }
  if (part.preset === "dome" || part.preset === "basin") {
    const t = Math.min(1, Math.hypot(dx, dy) / (half * Math.SQRT2)),
      bell = (1 + Math.cos(Math.PI * t)) / 2;
    return part.preset === "dome" ? a * bell : a * (1 - bell);
  }
  // A valley: low along the axis, its sides rising and rounding off.
  const across = Math.abs(dx * -sin + dy * cos) / half;
  return a * smoothstep(across);
}

/** Catmull–Rom across the lattice, so the coarse points leave no creases. Outside, the edge is repeated. */
function latticeHeight(part: VectorReliefLatticePart, point: Point): number {
  const x = (point[0] - part.origin[0]) / part.spacingMeters,
    y = (point[1] - part.origin[1]) / part.spacingMeters,
    cx = Math.min(part.columns - 1, Math.max(0, x)),
    cy = Math.min(part.rows - 1, Math.max(0, y)),
    x0 = Math.min(part.columns - 2, Math.floor(cx)),
    y0 = Math.min(part.rows - 2, Math.floor(cy)),
    tx = cx - x0,
    ty = cy - y0;
  const at = (c: number, r: number) =>
    part.elevationsMeters[
      Math.min(part.rows - 1, Math.max(0, r)) * part.columns + Math.min(part.columns - 1, Math.max(0, c))
    ];
  const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const rows = [-1, 0, 1, 2].map(r =>
    cubic(at(x0 - 1, y0 + r), at(x0, y0 + r), at(x0 + 1, y0 + r), at(x0 + 2, y0 + r), tx)
  );
  // Clamp to the four nearest points so the spline never overshoots into a pit or a spike.
  const near = [at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)];
  return Math.min(Math.max(...near), Math.max(Math.min(...near), cubic(rows[0], rows[1], rows[2], rows[3], ty)));
}

export function reliefPartHeight(part: VectorReliefPart, point: Point): number {
  if (part.kind === "preset") return presetHeight(part, point);
  if (part.kind === "lattice") return latticeHeight(part, point);
  return partHeightAt(part, point);
}

function distanceToLine(point: Point, line: readonly Point[], closed: boolean): number {
  let best = Infinity;
  const n = line.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = line[i],
      b = line[(i + 1) % n],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      lengthSq = dx * dx + dy * dy,
      t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq)) : 0;
    best = Math.min(best, Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t));
  }
  return best;
}

/** The ground with the earthworks: mounds raise it (max), ditches cut it (min) (§4.2). */
export function earthworkHeight(earthworks: readonly VectorEarthwork[], natural: number, point: Point): number {
  let height = natural;
  for (const e of earthworks)
    if (e.kind === "mound") {
      const d = Math.hypot(point[0] - e.center[0], point[1] - e.center[1]);
      if (d >= e.baseRadiusMeters) continue;
      const t = (d - e.summitRadiusMeters) / Math.max(1e-6, e.baseRadiusMeters - e.summitRadiusMeters),
        level = d <= e.summitRadiusMeters ? e.summitMeters : e.summitMeters + (natural - e.summitMeters) * t;
      height = Math.max(height, level);
    }
  for (const e of earthworks)
    if (e.kind === "ditch") {
      const d = distanceToLine(point, e.line, e.closed),
        lip = e.widthMeters / 2,
        floor = e.floorWidthMeters / 2;
      if (d >= lip) continue;
      const level =
        d <= floor ? e.floorMeters : e.floorMeters + (height - e.floorMeters) * ((d - floor) / (lip - floor));
      height = Math.min(height, level);
    }
  return height;
}

/** The natural ground and earthworks as a function of the point. */
export function reliefHeightFunction(relief: VectorRelief): (point: Point) => number {
  const parts = relief.parts,
    earthworks = relief.earthworks;
  return point => {
    let natural = 0;
    for (const part of parts) natural += reliefPartHeight(part, point);
    return earthworks.length ? earthworkHeight(earthworks, natural, point) : natural;
  };
}

/** Natural ground alone, before the earthworks. */
export function naturalHeightFunction(relief: VectorRelief): (point: Point) => number {
  return point => relief.parts.reduce((sum, part) => sum + reliefPartHeight(part, point), 0);
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

const MOVED = new Set(["hill", "dome", "range", "trough", "pit", "crag", "spur", "scarp"]);
function translate(part: PointTerrainPart, by: Point): PointTerrainPart {
  if (!MOVED.has(part.kind)) return part;
  const move = (p: Point): Point => [p[0] + by[0], p[1] + by[1]];
  switch (part.kind) {
    case "hill":
    case "dome":
    case "pit":
    case "crag":
      return { ...part, center: move(part.center) };
    case "range":
    case "trough":
      return { ...part, points: part.points.map(move) };
    case "spur":
      return { ...part, root: move(part.root), tip: move(part.tip) };
    case "scarp":
      return { ...part, origin: move(part.origin) };
    default:
      return part;
  }
}

/** Downhill bearing of the first river in the city, start to end; rivers must run down the slope. */
function riverAzimuth(doc: VectorCityDocument): number | undefined {
  for (const path of Object.values(doc.paths)) {
    if (path.role !== "river") continue;
    const samples = samplePath(path);
    if (samples.length < 2) continue;
    const a = samples[0].point,
      b = samples[samples.length - 1].point;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1) return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  return undefined;
}

export type ReliefTemplate = Exclude<TerrainTemplateId, "cells">;

/**
 * The relief the standalone settings ask for, or undefined for level ground. The mesh editor's presets become
 * smooth landforms over the frame; its terrain templates are natural landforms set back from the town, not
 * ground made for a castle (§3, §6.2).
 */
export function settingsRelief(
  doc: VectorCityDocument,
  settings: Pick<GenerationSettings, "elevationPreset" | "elevationRelief" | "elevationRotation" | "terrainField">,
  seedText: string,
  townRadiusMeters: number
): VectorRelief | undefined {
  const preset = settings.elevationPreset ?? "flat",
    template = settings.terrainField?.template;
  const landform = template && template !== "cells" ? (template as ReliefTemplate) : undefined;
  if (preset === "flat" && !landform) return undefined;
  const seed = hashSeed(`relief:${seedText}`),
    rng = makeRng(`relief:${seedText}`),
    extent = doc.frame.extentMeters,
    center = doc.site?.center ?? [0, 0],
    parts: VectorReliefPart[] = [{ kind: "offset", meters: 2 }];
  let amplitude = 0;
  if (preset !== "flat") {
    amplitude = presetAmplitude(extent, settings.elevationRelief);
    const rotation = elevationRotationDegrees(settings.elevationRotation),
      azimuth =
        rotation !== undefined
          ? (rotation * Math.PI) / 180
          : (riverAzimuth(doc) ?? ((hashSeed(seedText) % 360) * Math.PI) / 180);
    parts.push({
      kind: "preset",
      preset,
      center,
      azimuthRadians: azimuth,
      halfMeters: extent / 2,
      amplitudeMeters: amplitude
    });
  }
  // Rolling ground: a broad swell and a finer one, so no slope is a plane.
  const roll = Math.max(1.5, amplitude * 0.06);
  parts.push(
    { kind: "noise", amplitudeMeters: roll, wavelengthMeters: Math.max(120, extent / 5), octaves: 3, seed },
    { kind: "noise", amplitudeMeters: Math.min(1.2, roll / 2), wavelengthMeters: 70, octaves: 2, seed: seed + 7 }
  );
  if (landform) {
    const angle = rng.range(0, Math.PI * 2),
      reach = Math.min(extent * 0.38, townRadiusMeters + 110),
      by: Point = [center[0] + Math.cos(angle) * reach, center[1] + Math.sin(angle) * reach];
    for (const part of templateParts(landform, seed, extent))
      if (isPointTerrainPart(part) && part.kind !== "offset" && part.kind !== "noise") parts.push(translate(part, by));
  }
  return { version: 1, source: "settings", seed, ...(landform ? { template: landform } : {}), parts, earthworks: [] };
}

/** FMG's heights as the low frequency, with rolling ground in proportion to them between the lattice points. */
export function fmgRelief(
  heightfield: { size: number; spacingMeters: number; elevationsMeters: number[] },
  seedText: string
): VectorRelief | undefined {
  const { size, spacingMeters, elevationsMeters } = heightfield;
  if (size < 2 || elevationsMeters.length !== size * size) return undefined;
  const low = Math.min(...elevationsMeters),
    high = Math.max(...elevationsMeters);
  if (high - low < 1e-6) return undefined;
  const seed = hashSeed(`relief:${seedText}`),
    origin = -((size - 1) * spacingMeters) / 2;
  return {
    version: 1,
    source: "fmg",
    seed,
    parts: [
      {
        kind: "lattice",
        origin: [origin, origin],
        spacingMeters,
        columns: size,
        rows: size,
        elevationsMeters: [...elevationsMeters]
      },
      {
        kind: "noise",
        amplitudeMeters: Math.min(4, Math.max(0.5, (high - low) * 0.03)),
        wavelengthMeters: Math.max(60, spacingMeters * 1.2),
        octaves: 3,
        seed
      }
    ],
    earthworks: []
  };
}
