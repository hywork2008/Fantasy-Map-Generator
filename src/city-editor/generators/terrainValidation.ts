import type { CityDocument } from "../types/document";
import type { TerrainPlatform, TerrainRamp } from "../types/terrain";

export type PlatformEdge = TerrainPlatform["edge"];

export const validTerrainLevel = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;

export function validPlatformEdge(edge: unknown): edge is PlatformEdge {
  if (!edge || typeof edge !== "object") return false;
  const value = edge as { kind?: unknown; runMeters?: unknown };
  return (
    value.kind === "cliff" ||
    (value.kind === "slope" && typeof value.runMeters === "number" && value.runMeters > 0 && value.runMeters <= 200)
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
    const feature = item as Partial<TerrainPlatform> | null;
    const summit = feature?.summit as { kind?: unknown; faceIds?: unknown } | undefined;
    const valid =
      !!feature &&
      feature.kind === "platform" &&
      typeof feature.id === "string" &&
      !ids.has(feature.id) &&
      (feature.ownerId === undefined || typeof feature.ownerId === "string") &&
      summit?.kind === "faces" &&
      Array.isArray(summit.faceIds) &&
      summit.faceIds.length > 0 &&
      summit.faceIds.every(id => typeof id === "string") &&
      validTerrainLevel(feature.levelMeters) &&
      validPlatformEdge(feature.edge);
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
