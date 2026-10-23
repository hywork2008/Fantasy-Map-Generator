import type { CastlePlan, CityDocument } from "../types/document";
import type { Id } from "../types/primitives";
import type { TerrainPlatform } from "../types/terrain";

export type PlatformEdge = TerrainPlatform["edge"];

const platformId = (castleId: Id) => `castle-platform:${castleId}`;

/** The cells a castle stands on: its site cells, or the area its own circuit encloses. */
export function castleSiteFaceIds(document: CityDocument, castle: CastlePlan): Id[] {
  return castle.siteFaceIds ?? document.defenseCircuits?.find(c => c.id === castle.circuitId)?.areaFaceIds ?? [];
}

export function castlePlatform(document: CityDocument, castleId: Id): TerrainPlatform | undefined {
  return document.terrain?.features.find(feature => feature.ownerId === castleId);
}

/** Level the castle cells as one flat platform, or remove it with `null`. Fort sites grade their own ground. */
export function setCastlePlatform(
  document: CityDocument,
  castleId: Id,
  platform: { levelMeters: number; edge: PlatformEdge } | null
): CityDocument | null {
  const castle = document.castles?.find(item => item.id === castleId);
  if (!castle || castle.locked || document.fortSite?.castleId === castleId) return null;
  const faceIds = castleSiteFaceIds(document, castle).filter(
    id => document.mesh.faces[id]?.properties.water === "land"
  );
  if (platform && (!faceIds.length || !validLevel(platform.levelMeters) || !validEdge(platform.edge))) return null;
  const next = structuredClone(document);
  removeOwnedTerrain(next, castleId);
  if (platform) {
    next.terrain ??= { version: 1, features: [] };
    next.terrain.features.push({
      kind: "platform",
      id: platformId(castleId),
      ownerId: castleId,
      summit: { kind: "faces", faceIds },
      levelMeters: platform.levelMeters,
      edge: platform.edge
    });
  }
  return next;
}

/** Earthworks belong to the plan that made them; deleting that plan levels them again. */
export function removeOwnedTerrain(document: CityDocument, ownerId: Id): void {
  if (!document.terrain) return;
  document.terrain.features = document.terrain.features.filter(feature => feature.ownerId !== ownerId);
  if (!document.terrain.features.length) delete document.terrain;
}

const validLevel = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;

function validEdge(edge: unknown): edge is PlatformEdge {
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
  return value.features.flatMap((item: unknown, index): string[] => {
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
      validLevel(feature.levelMeters) &&
      validEdge(feature.edge);
    if (feature && typeof feature.id === "string") ids.add(feature.id);
    return valid ? [] : [`Invalid terrain feature ${index}`];
  });
}
