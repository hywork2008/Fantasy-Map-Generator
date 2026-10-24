import type { CastlePlan, CastleSettings, CityDocument, Point } from "../types/document";
import type { Id } from "../types/primitives";
import type { TerrainPlatform, TerrainRamp } from "../types/terrain";
import { polygonCentroid } from "./geom";
import { facePoints } from "./mesh";
import { planPlatformRamp } from "./rampPlanning";
import { terrainFieldForDocument } from "./terrainField/build";
import { sampleField } from "./terrainField/sample";
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
  return document.terrain?.features.find(
    (feature): feature is TerrainPlatform => feature.kind === "platform" && feature.ownerId === castleId
  );
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
  document.terrain.features = document.terrain.features.filter(
    feature => feature.kind !== "platform" || feature.ownerId !== ownerId
  );
  const ramps = document.terrain.ramps?.filter(ramp => ramp.ownerId !== ownerId);
  if (ramps?.length) document.terrain.ramps = ramps;
  else delete document.terrain.ramps;
  if (!document.terrain.features.length && !document.terrain.ramps && !document.terrain.field) delete document.terrain;
}

export const DEFAULT_CASTLE_RISE_METERS = 12;

/** Highest ground among a castle's land cells: the height field, or the cell elevation and any terrace. */
function castleSiteTop(document: CityDocument, castle: CastlePlan): number | null {
  if (document.terrain?.field) {
    const field = terrainFieldForDocument(document);
    if (field) {
      const samples: number[] = [];
      for (const id of castleSiteFaceIds(document, castle)) {
        const face = document.mesh.faces[id];
        if (face?.properties.water !== "land") continue;
        const ring = facePoints(document.mesh, face);
        for (const point of ring) samples.push(sampleField(field, point));
        if (ring.length) samples.push(sampleField(field, polygonCentroid(ring)));
      }
      if (samples.length) return Math.max(...samples);
    }
  }
  const terraces = (document.terrain?.features ?? []).filter(
    (feature): feature is TerrainPlatform =>
      feature.kind === "platform" && feature.role === "terrace" && feature.summit.kind === "faces"
  );
  const levels = castleSiteFaceIds(document, castle)
    .map(id => document.mesh.faces[id])
    .filter(face => face?.properties.water === "land")
    .map(face =>
      Math.max(
        face.properties.elevation,
        ...terraces
          .filter(terrace => terrace.summit.kind === "faces" && terrace.summit.faceIds.includes(face.id))
          .map(terrace => terrace.levelMeters)
      )
    );
  return levels.length ? Math.max(...levels) : null;
}

/**
 * Earthworks for a freshly generated town. The requested castle ground applies to every castle; otherwise a platform
 * the input document gave a castle of the same id is rebuilt at the same height above its new cells. Saved earthworks
 * name cells, which generation replaces, so nothing else carries over; terraces already levelled on `result` stay.
 */
export function generatedCastleTerrain(
  result: CityDocument,
  input: CityDocument,
  settings: Partial<CastleSettings> | undefined
): CityDocument["terrain"] {
  if (result.fortSite) return undefined;
  const previous = new Map<Id, { rise: number; edge: PlatformEdge }>();
  for (const feature of input.terrain?.features ?? []) {
    if (feature.kind !== "platform" || !feature.ownerId) continue;
    const castle = input.castles?.find(item => item.id === feature.ownerId);
    const top = castle ? castleSiteTop(input, castle) : null;
    if (castle && top !== null) previous.set(castle.id, { rise: feature.levelMeters - top, edge: feature.edge });
  }
  // Terraces, pads, and river corridors were levelled for this mesh just before. Castle earthworks stand on them.
  const carried =
    result.terrain?.features.filter(
      feature =>
        feature.kind === "riverCorridor" ||
        (feature.kind === "platform" && (feature.role === "terrace" || feature.role === "pad"))
    ) ?? [];
  const field = result.terrain?.field;
  const fieldMode = !!field;
  let next: CityDocument = {
    ...result,
    terrain: carried.length || field ? { version: 1, features: carried, ...(field ? { field } : {}) } : undefined
  };
  for (const castle of result.castles ?? []) {
    const top = castleSiteTop(next, castle);
    if (top === null) continue;
    const requested =
      settings?.ground === "cliff" || settings?.ground === "slope"
        ? (() => {
            const rise = fieldMode
              ? (settings.groundRiseMeters ?? 0)
              : (settings.groundRiseMeters ?? DEFAULT_CASTLE_RISE_METERS);
            const edge: PlatformEdge =
              settings.ground === "cliff" ? { kind: "cliff" } : { kind: "slope", runMeters: Math.max(10, rise * 1.5) };
            return { rise, edge };
          })()
        : settings?.ground === "natural"
          ? null
          : (previous.get(castle.id) ?? (fieldMode ? { rise: 0, edge: { kind: "cliff" as const } } : undefined));
    if (!requested || (!(requested.rise > 0) && !fieldMode)) continue;
    next = setCastlePlatform(next, castle.id, { levelMeters: top + requested.rise, edge: requested.edge }) ?? next;
  }
  return next.terrain;
}
