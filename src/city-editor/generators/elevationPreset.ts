// Cell-elevation presets and the rule that a river bed never rises downstream.

import type { CityDocument, Id, Mesh, Point, RiverGroup } from "../types/document";
import type { ElevationPreset } from "../types/generationSettings";
import { reservedCastleFaces } from "./fortifications";
import { landElevation } from "./generation/assembly/documentProperties";
import { polygonCentroid } from "./geom";
import { facePoints, incidentFaces } from "./mesh";

export type { ElevationPreset };
export const ELEVATION_PRESETS = [
  "flat",
  "slope",
  "dome",
  "basin",
  "valley"
] as const satisfies readonly ElevationPreset[];

const LAND_FLOOR_METERS = 1;
const LOW_METERS = 2;
/** A rise smaller than this stays put, so a flat river is not flipped by rounding. */
const REVERSE_EPSILON_METERS = 0.5;

export function isElevationPreset(value: unknown): value is ElevationPreset {
  return typeof value === "string" && (ELEVATION_PRESETS as readonly string[]).includes(value);
}

/** Relief across the frame, in metres, before the relief multiplier. 4% of the side, clamped to 12–80 m. */
export function reliefAmplitude(extentMeters: number): number {
  return roundTenth(Math.min(80, Math.max(12, extentMeters * 0.04)));
}

/** Slider bounds. 1 keeps the clamped base amplitude; higher values scale that base past 80 m. */
export const ELEVATION_RELIEF_MIN = 1;
export const ELEVATION_RELIEF_MAX = 8;
export const ELEVATION_RELIEF_STEP = 0.1;

/** Unset or non-finite values are 1. Other numbers snap to 0.1 and stay inside 1–8. */
export function elevationReliefScale(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return ELEVATION_RELIEF_MIN;
  const stepped = Math.round(value * 10) / 10;
  return Math.min(ELEVATION_RELIEF_MAX, Math.max(ELEVATION_RELIEF_MIN, stepped));
}

/** Preset height span in metres. The 12–80 m clamp applies at 1×, then the multiplier scales it. */
export function presetAmplitude(extentMeters: number, relief?: number): number {
  return roundTenth(reliefAmplitude(extentMeters) * elevationReliefScale(relief));
}

/** Clockwise degrees from the positive X axis. Unset preserves automatic orientation. */
export function elevationRotationDegrees(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return ((value % 360) + 360) % 360;
}

export interface ElevationSamplePlan {
  elevationPreset?: ElevationPreset;
  /** Multiplier on {@link presetAmplitude}. Unset is 1. */
  elevationRelief?: number;
  elevationRotation?: number;
  elevationSeed?: string;
  fmgElevations?: Map<number, number>;
  rivers: ReadonlyArray<{ resolvedEdgePoints: Point[] }>;
  waterPolygon: Point[] | null;
}

/** Metres at one land cell. `flat` keeps the FMG height or the current value. */
export function elevationSampler(plan: ElevationSamplePlan, frame: { extentMeters: number }) {
  const preset = plan.elevationPreset ?? "flat";
  const half = Math.max(1, frame.extentMeters / 2);
  const amplitude = presetAmplitude(frame.extentMeters, plan.elevationRelief);
  const rotation = elevationRotationDegrees(plan.elevationRotation);
  const azimuth =
    rotation === undefined
      ? downhillAzimuth(plan.rivers, plan.waterPolygon, plan.elevationSeed ?? "")
      : (rotation * Math.PI) / 180;
  return (point: Point, cellId: number, current: number): number => {
    if (preset === "flat") return landElevation(plan, cellId, current);
    return presetElevation(preset, point, half, azimuth, amplitude);
  };
}

/**
 * Downhill azimuth in radians. A river's planned downstream wins, then the
 * direction from the origin toward the coast, then a bearing hashed from the seed.
 */
export function downhillAzimuth(
  rivers: ReadonlyArray<{ resolvedEdgePoints: Point[] }>,
  waterPolygon: Point[] | null,
  seed: string
): number {
  for (const river of rivers) {
    const points = river.resolvedEdgePoints;
    if (points.length < 2) continue;
    const from = points[0];
    const to = points[points.length - 1];
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 1) return Math.atan2(to[1] - from[1], to[0] - from[0]);
  }
  if (waterPolygon && waterPolygon.length >= 3) {
    const coast = polygonCentroid(waterPolygon);
    if (Math.hypot(coast[0], coast[1]) > 1) return Math.atan2(coast[1], coast[0]);
  }
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return (((hash >>> 0) % 360) * Math.PI) / 180;
}

export function presetElevation(
  preset: Exclude<ElevationPreset, "flat">,
  point: Point,
  half: number,
  azimuth: number,
  amplitude: number
): number {
  const low = LOW_METERS;
  const high = roundTenth(low + amplitude);
  if (preset === "slope") {
    const along = (point[0] * Math.cos(azimuth) + point[1] * Math.sin(azimuth)) / half;
    const downhill = clamp((along + 1) / 2, 0, 1);
    return roundTenth(high + (low - high) * downhill);
  }
  if (preset === "dome" || preset === "basin") {
    const outward = clamp(Math.hypot(point[0], point[1]) / (half * Math.SQRT2), 0, 1);
    const center = preset === "dome" ? high : low;
    const rim = preset === "dome" ? low : high;
    return roundTenth(center + (rim - center) * outward);
  }
  const across = Math.abs(point[0] * -Math.sin(azimuth) + point[1] * Math.cos(azimuth)) / half;
  return roundTenth(low + (high - low) * clamp(across, 0, 1));
}

export interface ElevationReliefUpdate {
  elevationPreset?: ElevationPreset;
  elevationRelief?: number;
  elevationRotation?: number;
  elevationSeed?: string;
}

/**
 * Rewrite land elevations with the current preset and relief, then keep river
 * beds from climbing. Streets, wards, and buildings stay. A flat preset, and a
 * map that already matches, return the same document.
 */
export function applyElevationRelief(document: CityDocument, update: ElevationReliefUpdate): CityDocument {
  const preset = update.elevationPreset ?? "flat";
  if (preset === "flat") return document;
  const sample = elevationSampler(
    {
      elevationPreset: preset,
      elevationRelief: update.elevationRelief,
      elevationRotation: update.elevationRotation,
      elevationSeed: update.elevationSeed,
      rivers: documentRivers(document),
      waterPolygon: seaReliefPolygon(document)
    },
    document.frame
  );
  const reserved = reservedCastleFaces(document);
  let faces = document.mesh.faces;
  let copied = false;
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.locked || face.properties.water !== "land" || reserved.has(face.id)) continue;
    const next = sample(polygonCentroid(facePoints(document.mesh, face)), 0, face.properties.elevation);
    if (face.properties.elevation === next) continue;
    if (!copied) {
      faces = { ...faces };
      copied = true;
    }
    faces[face.id] = { ...face, properties: { ...face.properties, elevation: next } };
  }
  const sampled = copied ? { ...document, mesh: { ...document.mesh, faces } } : document;
  const settled = settleRiverGrades(sampled);
  if (sameElevations(document, settled) && sameRiverOrder(document, settled)) return document;
  return settled;
}

/**
 * Turn every river so its land bed does not rise downstream, lowering unlocked
 * land cells that still form a step. Sea cells stay as they are. Returns the
 * same document when nothing changes.
 */
export function settleRiverGrades(document: CityDocument): CityDocument {
  let faces = document.mesh.faces;
  let facesCopied = false;
  let groups = document.featureGroups;
  let groupsCopied = false;
  const writeFace = (faceId: Id, elevation: number): void => {
    const face = faces[faceId];
    if (!face || face.properties.locked || face.properties.water !== "land") return;
    const next = Math.max(LAND_FLOOR_METERS, roundTenth(elevation));
    if (face.properties.elevation <= next + 1e-6) return;
    if (!facesCopied) {
      faces = { ...faces };
      facesCopied = true;
    }
    faces[faceId] = { ...face, properties: { ...face.properties, elevation: next } };
  };
  const workingMesh = (): Mesh => ({ ...document.mesh, faces });
  const bed = (vertexId: Id): number | null => landBed(workingMesh(), vertexId);

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    if (group.kind !== "river" || group.vertices.length < 2) continue;
    let vertices = group.vertices;
    const seaStart = touchesSea(workingMesh(), vertices[0]);
    const seaEnd = touchesSea(workingMesh(), vertices[vertices.length - 1]);
    const startBed = firstLandBed(workingMesh(), vertices);
    const endBed = firstLandBed(workingMesh(), [...vertices].reverse());
    const reverse =
      !group.locked &&
      ((seaStart && !seaEnd) ||
        (!seaStart && !seaEnd && endBed !== null && startBed !== null && endBed > startBed + REVERSE_EPSILON_METERS));
    if (reverse) {
      vertices = [...vertices].reverse();
      const upstream = vertices[0];
      const downstream = vertices[vertices.length - 1];
      const turned: RiverGroup = {
        ...group,
        vertices,
        source: { vertexId: upstream, kind: sourceKind(document, upstream) },
        mouth: { vertexId: downstream, kind: mouthKind(document, downstream) }
      };
      if (!groupsCopied) {
        groups = groups.slice();
        groupsCopied = true;
      }
      groups[index] = turned;
    }
    let running: number | null = null;
    for (const vertexId of vertices) {
      const height = bed(vertexId);
      if (height === null) continue;
      if (running === null) {
        running = height;
        continue;
      }
      if (height > running + 1e-6) writeFaceAt(document.mesh, vertexId, running, writeFace);
      const after = landBed(workingMesh(), vertexId);
      if (after !== null) running = Math.min(running, after);
    }
  }

  if (!facesCopied && !groupsCopied) return document;
  return {
    ...document,
    ...(facesCopied ? { mesh: { ...document.mesh, faces } } : {}),
    ...(groupsCopied ? { featureGroups: groups } : {})
  };
}

function writeFaceAt(
  mesh: Mesh,
  vertexId: Id,
  elevation: number,
  writeFace: (faceId: Id, elevation: number) => void
): void {
  for (const face of incidentFaces(mesh, vertexId)) writeFace(face.id, elevation);
}

function landBed(mesh: Mesh, vertexId: Id): number | null {
  let bed = Infinity;
  for (const face of incidentFaces(mesh, vertexId)) {
    if (face.properties.water !== "land" || !Number.isFinite(face.properties.elevation)) continue;
    bed = Math.min(bed, face.properties.elevation);
  }
  return Number.isFinite(bed) ? bed : null;
}

function firstLandBed(mesh: Mesh, vertices: readonly Id[]): number | null {
  for (const vertexId of vertices) {
    const bed = landBed(mesh, vertexId);
    if (bed !== null) return bed;
  }
  return null;
}

function touchesSea(mesh: Mesh, vertexId: Id): boolean {
  return incidentFaces(mesh, vertexId).some(face => face.properties.water !== "land" || face.properties.elevation <= 0);
}

function sourceKind(document: CityDocument, vertexId: Id): "mapBoundary" | "spring" | "tributary" {
  const kind = endKind(document, vertexId);
  return kind === "mapBoundary" ? "mapBoundary" : "spring";
}

function mouthKind(document: CityDocument, vertexId: Id): "mapBoundary" | "water" | "river" {
  const kind = endKind(document, vertexId);
  return kind === "spring" ? "river" : kind;
}

function endKind(document: CityDocument, vertexId: Id): "water" | "mapBoundary" | "spring" {
  if (touchesSea(document.mesh, vertexId)) return "water";
  const point = document.mesh.vertices[vertexId]?.point;
  if (!point) return "spring";
  const half = document.frame.extentMeters / 2;
  const onFrame = Math.abs(Math.abs(point[0]) - half) <= 1 || Math.abs(Math.abs(point[1]) - half) <= 1;
  return onFrame ? "mapBoundary" : "spring";
}

/** River groups already run upstream to downstream. Their vertices orient the preset. */
function documentRivers(document: CityDocument): { resolvedEdgePoints: Point[] }[] {
  const courses: { resolvedEdgePoints: Point[] }[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "river" || group.vertices.length < 2) continue;
    const points: Point[] = [];
    for (const vertexId of group.vertices) {
      const point = document.mesh.vertices[vertexId]?.point;
      if (point) points.push(point);
    }
    if (points.length >= 2) courses.push({ resolvedEdgePoints: points });
  }
  return courses;
}

/**
 * A tiny triangle whose centroid is the mean of the sea-face sites.
 * River channels in `waterAreas` are not a coast.
 */
function seaReliefPolygon(document: CityDocument): Point[] | null {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water === "land") continue;
    const site = face.site ?? polygonCentroid(facePoints(document.mesh, face));
    x += site[0];
    y += site[1];
    count += 1;
  }
  if (count === 0) return null;
  const mx = x / count;
  const my = y / count;
  return [
    [mx - 1, my - 1],
    [mx + 2, my - 1],
    [mx - 1, my + 2]
  ];
}

function sameElevations(before: CityDocument, after: CityDocument): boolean {
  if (before.mesh.faces === after.mesh.faces) return true;
  for (const id in before.mesh.faces) {
    if (before.mesh.faces[id].properties.elevation !== after.mesh.faces[id]?.properties.elevation) return false;
  }
  return true;
}

function sameRiverOrder(before: CityDocument, after: CityDocument): boolean {
  if (before.featureGroups === after.featureGroups) return true;
  if (before.featureGroups.length !== after.featureGroups.length) return false;
  for (let index = 0; index < before.featureGroups.length; index++) {
    const left = before.featureGroups[index];
    const right = after.featureGroups[index];
    if (left === right) continue;
    if (left.kind !== "river" || right.kind !== "river" || left.vertices.length !== right.vertices.length) return false;
    for (let vertex = 0; vertex < left.vertices.length; vertex++) {
      if (left.vertices[vertex] !== right.vertices[vertex]) return false;
    }
  }
  return true;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
