// Cell-elevation presets and the rule that a river bed never rises downstream.

import type { CityDocument, Id, Mesh, Point, RiverGroup } from "../types/document";
import type { ElevationPreset } from "../types/generationSettings";
import { landElevation } from "./generation/assembly/documentProperties";
import { polygonCentroid } from "./geom";
import { incidentFaces } from "./mesh";

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

/** Relief across the frame, in metres. 4% of the side, clamped to 12–80 m. */
export function reliefAmplitude(extentMeters: number): number {
  return roundTenth(Math.min(80, Math.max(12, extentMeters * 0.04)));
}

export interface ElevationSamplePlan {
  elevationPreset?: ElevationPreset;
  elevationSeed?: string;
  fmgElevations?: Map<number, number>;
  rivers: ReadonlyArray<{ resolvedEdgePoints: Point[] }>;
  waterPolygon: Point[] | null;
}

/** Metres at one land cell. `flat` keeps the FMG height or the current value. */
export function elevationSampler(plan: ElevationSamplePlan, frame: { extentMeters: number }) {
  const preset = plan.elevationPreset ?? "flat";
  const half = Math.max(1, frame.extentMeters / 2);
  const amplitude = reliefAmplitude(frame.extentMeters);
  const azimuth = downhillAzimuth(plan.rivers, plan.waterPolygon, plan.elevationSeed ?? "");
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

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
