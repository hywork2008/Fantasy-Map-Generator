import type { CastlePlan, CityDocument, Point } from "../types/document";
import type { Id } from "../types/primitives";
import type { TerrainPlatform, TerrainRamp } from "../types/terrain";
import { planPlatformRamp } from "./rampPlanning";
import type { PlatformEdge } from "./terrainValidation";
import { validPlatformEdge, validTerrainLevel } from "./terrainValidation";

export type { PlatformEdge } from "./terrainValidation";

const platformId = (castleId: Id) => `castle-platform:${castleId}`;

/** The cells a castle stands on: its site cells, or the area its own circuit encloses. */
export function castleSiteFaceIds(document: CityDocument, castle: CastlePlan): Id[] {
  return castle.siteFaceIds ?? document.defenseCircuits?.find(c => c.id === castle.circuitId)?.areaFaceIds ?? [];
}

/** The castle's main gate, or any gate it owns, as a point on its circuit. */
export function castleGatePoint(document: CityDocument, castle: CastlePlan): Point | undefined {
  const gates = document.gates.filter(
    gate => gate.ownerCastleId === castle.id || castle.accesses.some(access => access.gateId === gate.id)
  );
  const gate = gates.find(item => item.role === "castle-main") ?? gates[0];
  return gate ? document.mesh.vertices[gate.vertexId]?.point : undefined;
}

export function castleRamp(document: CityDocument, castleId: Id): TerrainRamp | undefined {
  return document.terrain?.ramps?.find(ramp => ramp.ownerId === castleId);
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
  if (platform && (!faceIds.length || !validTerrainLevel(platform.levelMeters) || !validPlatformEdge(platform.edge)))
    return null;
  const next = structuredClone(document);
  removeOwnedTerrain(next, castleId);
  if (platform) {
    next.terrain ??= { version: 1, features: [] };
    const feature: TerrainPlatform = {
      kind: "platform",
      id: platformId(castleId),
      ownerId: castleId,
      summit: { kind: "faces", faceIds },
      levelMeters: platform.levelMeters,
      edge: platform.edge
    };
    next.terrain.features.push(feature);
    // A cliff shuts the gate off from the town; a ramp climbs to it along the cliff foot.
    if (platform.edge.kind === "cliff") {
      const ramp = planPlatformRamp(next, feature, {
        id: `castle-ramp:${castleId}`,
        ownerId: castleId,
        landing: castleGatePoint(next, castle)
      });
      if (typeof ramp !== "string") next.terrain.ramps = [...(next.terrain.ramps ?? []), ramp];
    }
  }
  return next;
}

/** Earthworks belong to the plan that made them; deleting that plan levels them again. */
export function removeOwnedTerrain(document: CityDocument, ownerId: Id): void {
  if (!document.terrain) return;
  document.terrain.features = document.terrain.features.filter(feature => feature.ownerId !== ownerId);
  const ramps = document.terrain.ramps?.filter(ramp => ramp.ownerId !== ownerId);
  if (ramps?.length) document.terrain.ramps = ramps;
  else delete document.terrain.ramps;
  if (!document.terrain.features.length && !document.terrain.ramps) delete document.terrain;
}
