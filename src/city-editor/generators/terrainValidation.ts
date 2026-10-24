import type { CityDocument, Point } from "../types/document";
import type { TerrainPlatform, TerrainRamp, TerrainRiverCorridor } from "../types/terrain";

export type PlatformEdge = TerrainPlatform["edge"];

export const validTerrainLevel = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;

const finiteLevel = (value: unknown) => typeof value === "number" && Number.isFinite(value);

export function validPlatformEdge(edge: unknown): edge is PlatformEdge {
  if (!edge || typeof edge !== "object") return false;
  const value = edge as { kind?: unknown; runMeters?: unknown; heightMeters?: unknown };
  return (
    value.kind === "cliff" ||
    value.kind === "wall" ||
    (value.kind === "slope" && typeof value.runMeters === "number" && value.runMeters > 0 && value.runMeters <= 200)
  );
}

function validPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) && value.length === 2 && value.every(item => typeof item === "number" && Number.isFinite(item))
  );
}

function validCorridor(feature: Partial<TerrainRiverCorridor> | null, ids: Set<string>): boolean {
  if (feature?.kind !== "riverCorridor") return false;
  const line = feature.centerline;
  const widths = feature.widthsMeters;
  const beds = feature.bedMeters;
  const bank = feature.bank;
  const bankOk =
    !!bank &&
    (bank.kind === "slope"
      ? typeof bank.runMeters === "number" && bank.runMeters > 0 && bank.runMeters <= 200
      : bank.kind === "quay" &&
        typeof bank.heightMeters === "number" &&
        Number.isFinite(bank.heightMeters) &&
        bank.heightMeters >= 0);
  return (
    typeof feature.id === "string" &&
    !ids.has(feature.id) &&
    typeof feature.sourceId === "string" &&
    Array.isArray(line) &&
    line.length >= 2 &&
    line.length <= 400 &&
    line.every(validPoint) &&
    Array.isArray(widths) &&
    widths.length === line.length &&
    widths.every(width => typeof width === "number" && width > 0 && width <= 500) &&
    Array.isArray(beds) &&
    beds.length === line.length &&
    beds.every((bed, index) => finiteLevel(bed) && (index === 0 || bed <= beds[index - 1] + 1e-4)) &&
    typeof feature.depthMeters === "number" &&
    feature.depthMeters > 0 &&
    feature.depthMeters <= 40 &&
    bankOk
  );
}

function validPolygonPad(feature: Partial<TerrainPlatform>, summit: { kind?: unknown; points?: unknown }): boolean {
  const points = summit.points;
  return (
    feature.role === "pad" &&
    summit.kind === "polygon" &&
    Array.isArray(points) &&
    points.length >= 3 &&
    points.length <= 200 &&
    points.every(validPoint) &&
    finiteLevel(feature.levelMeters)
  );
}

/** Structure only: cells missing after mesh edits are skipped when the terrain is evaluated. */
export function validateTerrainLayer(document: CityDocument): string[] {
  const layer = document.terrain as unknown;
  if (layer === undefined) return [];
  const value = layer as { version?: unknown; features?: unknown };
  if (!layer || typeof layer !== "object" || value.version !== 1 || !Array.isArray(value.features))
    return ["Invalid terrain layer"];
  const ids = new Set<string>();
  const errors = value.features.flatMap((item: unknown, index): string[] => {
    const feature = item as Partial<TerrainPlatform> | Partial<TerrainRiverCorridor> | null;
    if (feature && (feature as { kind?: unknown }).kind === "riverCorridor") {
      const valid = validCorridor(feature as Partial<TerrainRiverCorridor>, ids);
      if (feature && typeof feature.id === "string") ids.add(feature.id);
      return valid ? [] : [`Invalid terrain feature ${index}`];
    }
    const platform = feature as Partial<TerrainPlatform> | null;
    const summit = platform?.summit as { kind?: unknown; faceIds?: unknown; points?: unknown } | undefined;
    const facesSummit =
      summit?.kind === "faces" &&
      Array.isArray(summit.faceIds) &&
      summit.faceIds.length > 0 &&
      summit.faceIds.every(id => typeof id === "string") &&
      validTerrainLevel(platform?.levelMeters);
    const valid =
      !!platform &&
      platform.kind === "platform" &&
      typeof platform.id === "string" &&
      !ids.has(platform.id) &&
      (platform.ownerId === undefined || typeof platform.ownerId === "string") &&
      (platform.role === undefined ||
        (platform.role === "terrace" && platform.edge?.kind === "cliff") ||
        platform.role === "pad") &&
      ((platform.role === "pad" && summit ? validPolygonPad(platform, summit) : facesSummit) ||
        (platform.role !== "pad" && facesSummit)) &&
      validPlatformEdge(platform.edge);
    if (feature && typeof feature.id === "string") ids.add(feature.id);
    return valid ? [] : [`Invalid terrain feature ${index}`];
  });
  const rampValue = (layer as { ramps?: unknown }).ramps;
  if (rampValue === undefined) return errors;
  if (!Array.isArray(rampValue)) return [...errors, "Invalid terrain ramps"];
  return [
    ...errors,
    ...rampValue.flatMap((item: unknown, index): string[] => {
      const ramp = item as Partial<TerrainRamp> | null;
      const points = ramp?.centerline,
        levels = ramp?.elevationsMeters;
      const valid =
        !!ramp &&
        ramp.kind === "ramp" &&
        typeof ramp.id === "string" &&
        !ids.has(ramp.id) &&
        typeof ramp.platformId === "string" &&
        (ramp.ownerId === undefined || typeof ramp.ownerId === "string") &&
        typeof ramp.widthMeters === "number" &&
        ramp.widthMeters > 0 &&
        ramp.widthMeters <= 20 &&
        Array.isArray(points) &&
        points.length >= 2 &&
        points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) &&
        Array.isArray(levels) &&
        levels.length === points.length &&
        levels.every(level => typeof level === "number" && Number.isFinite(level));
      if (ramp && typeof ramp.id === "string") ids.add(ramp.id);
      return valid ? [] : [`Invalid terrain ramp ${index}`];
    })
  ];
}
