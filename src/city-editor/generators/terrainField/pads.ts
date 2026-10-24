// Building pads: flat polygons cut back from rivers and roads. Field mode only.

import type { CityDocument, Id, Point } from "../../types/document";
import type { TerrainPlatform, TerrainRiverCorridor } from "../../types/terrain";
import type { BuildingLot } from "../buildingLots.types";
import { polygonArea } from "../geom";
import { facePoints, setFaceElevation } from "../mesh";
import { terrainFieldForDocument } from "./build";
import { clipPieces, corridorRings, roadBands, syncRiverCorridors } from "./corridor";
import { castleFaceIds, fieldFoundation, retainingExceeds } from "./lots";
import { sampleField } from "./sample";

const PAD_PREFIX = "pad:";
const LOT_PREFIX = "lot:";

function corridorsOf(document: CityDocument): TerrainRiverCorridor[] {
  return (document.terrain?.features ?? []).filter(feature => feature.kind === "riverCorridor");
}

function cutters(document: CityDocument): Point[][] {
  const rings: Point[][] = [];
  for (const corridor of corridorsOf(document)) rings.push(...corridorRings(corridor));
  rings.push(...roadBands(document));
  return rings;
}

function padId(key: string, index: number): Id {
  return index === 0 ? `${PAD_PREFIX}${key}` : `${PAD_PREFIX}${key}:${index}`;
}

function isHandPad(document: CityDocument, feature: TerrainPlatform): boolean {
  if (!feature.id.startsWith(PAD_PREFIX)) return false;
  const body = feature.id.slice(PAD_PREFIX.length);
  if (body.startsWith(LOT_PREFIX)) return false;
  return !!document.mesh.faces[body.split(":")[0]];
}

/**
 * In a height field, editing a cell's elevation lays a pad on the dry part of that cell.
 * The stored cell elevation stays the derived mean.
 */
export function editFaceElevation(document: CityDocument, faceId: Id, elevation: number): CityDocument {
  if (!document.terrain?.field) return setFaceElevation(document, faceId, elevation);
  const face = document.mesh.faces[faceId];
  if (!face || face.properties.locked || !Number.isFinite(elevation)) return document;
  const next = structuredClone(document);
  const field = terrainFieldForDocument(next);
  if (field) syncRiverCorridors(next, field);
  const ring = facePoints(next.mesh, next.mesh.faces[faceId]);
  const pieces = clipPieces(ring, cutters(next)).filter(piece => Math.abs(polygonArea(piece)) >= 4);
  next.terrain ??= { version: 1, features: [] };
  const prefix = padId(faceId, 0);
  next.terrain.features = next.terrain.features.filter(
    feature => feature.kind !== "platform" || (feature.id !== prefix && !feature.id.startsWith(`${prefix}:`))
  );
  for (let index = 0; index < pieces.length; index++) {
    const pad: TerrainPlatform = {
      kind: "platform",
      id: padId(faceId, index),
      role: "pad",
      summit: { kind: "polygon", points: pieces[index] },
      levelMeters: elevation,
      edge: { kind: "wall" }
    };
    next.terrain.features.push(pad);
  }
  return next;
}

/**
 * One wall-edged pad per building lot, at one level per parcel.
 * The polygon is the lot minus river banks and road bands. Castle faces and lots
 * whose edge would need a wall taller than the retaining limit are left unpadded.
 */
export function padsForLots(document: CityDocument, lots: readonly BuildingLot[]): TerrainPlatform[] {
  const field = document.terrain?.field ? terrainFieldForDocument(document) : null;
  if (!field) return [];
  const castle = castleFaceIds(document);
  const clips = cutters(document);
  const sample = (point: Point) => sampleField(field, point);
  const levels = new Map<string, number>();
  const pads: TerrainPlatform[] = [];
  for (let index = 0; index < lots.length; index++) {
    const lot = lots[index];
    if (castle.has(lot.faceId)) continue;
    const pieces = clipPieces(lot.polygon, clips).filter(piece => Math.abs(polygonArea(piece)) >= 8);
    if (!pieces.length) continue;
    const key = `${LOT_PREFIX}${lot.parcelId ?? lot.id ?? `${lot.faceId}:${index}`}`;
    let level = levels.get(key);
    if (level === undefined) {
      const largest = pieces.reduce((best, piece) =>
        Math.abs(polygonArea(piece)) > Math.abs(polygonArea(best)) ? piece : best
      );
      level = fieldFoundation(largest, sample, sample);
      if (retainingExceeds(largest, level, sample)) continue;
      levels.set(key, level);
    }
    for (let piece = 0; piece < pieces.length; piece++) {
      const points = pieces[piece];
      if (retainingExceeds(points, level, sample)) continue;
      pads.push({
        kind: "platform",
        id: padId(key, piece),
        role: "pad",
        summit: { kind: "polygon", points },
        levelMeters: level,
        edge: { kind: "wall" }
      });
    }
  }
  return pads;
}

/** Replace generated lot pads. Hand pads (`pad:<faceId>`) stay. */
export function installLotPads(document: CityDocument, lots: readonly BuildingLot[]): void {
  if (!document.terrain?.field) return;
  const pads = padsForLots(document, lots);
  const kept = document.terrain.features.filter(
    feature => feature.kind !== "platform" || feature.role !== "pad" || isHandPad(document, feature)
  );
  document.terrain.features = [...kept, ...pads];
}

/** Largest piece of a footprint that is outside river corridors. */
export function dryBuildingPolygon(document: CityDocument, polygon: Point[]): Point[] | null {
  const clips = corridorsOf(document).flatMap(corridor => corridorRings(corridor));
  if (!clips.length) return polygon;
  const pieces = clipPieces(polygon, clips).filter(piece => Math.abs(polygonArea(piece)) >= 8);
  if (!pieces.length) return null;
  pieces.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  return pieces[0];
}
