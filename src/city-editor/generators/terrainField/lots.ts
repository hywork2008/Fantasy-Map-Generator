import type { CityDocument, Point } from "../../types/document";
import type { CityTerrain } from "../../types/terrain";
import type { BuildingLot } from "../buildingLots.types";
import { pointInPolygon, polygonArea, polygonCentroid } from "../geom";
import { facePoints } from "../mesh";
import { RETAINING_MAX_METERS, SMALL_LOT_MAX_M2, STEEP_BUILDING_SLOPE, UNBUILDABLE_SLOPE } from "./constants";
import { median } from "./sample";

export function castleFaceIds(document: CityDocument): Set<string> {
  const ids = new Set<string>();
  for (const castle of document.castles ?? []) {
    for (const id of castle.siteFaceIds ?? []) ids.add(id);
    const circuit = document.defenseCircuits?.find(item => item.id === castle.circuitId);
    for (const id of circuit?.areaFaceIds ?? []) if (document.mesh.faces[id]?.properties.ward === "castle") ids.add(id);
  }
  for (const face of Object.values(document.mesh.faces)) if (face.properties.ward === "castle") ids.add(face.id);
  for (const feature of document.terrain?.features ?? [])
    if (feature.kind === "platform" && feature.ownerId && feature.summit.kind === "faces")
      for (const id of feature.summit.faceIds) ids.add(id);
  return ids;
}

/** Balanced pad height for a height field: the median sample, kept within a stair of the street. */
export function fieldFoundation(
  ring: readonly Point[],
  heightAt: (point: Point) => number,
  surfaceAt: (point: Point) => number
): number {
  if (ring.length < 3) return 0;
  const xs = ring.map(point => point[0]);
  const ys = ring.map(point => point[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...ys) - Math.min(...ys);
  const step = Math.max(2, Math.sqrt((width * depth) / 48));
  const samples: number[] = [];
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += step)
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += step)
      if (pointInPolygon([x, y], ring as Point[])) samples.push(heightAt([x, y]));
  if (samples.length < 3) for (const point of ring) samples.push(heightAt(point));
  let level = median(samples);
  const street = surfaceAt(polygonCentroid(ring as Point[]));
  if (Math.abs(level - street) > RETAINING_MAX_METERS)
    level = street + Math.sign(level - street) * RETAINING_MAX_METERS;
  return level;
}

export function retainingExceeds(ring: readonly Point[], level: number, heightAt: (point: Point) => number): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    for (const t of [0, 0.5, 1]) {
      const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (Math.abs(heightAt(point) - level) > RETAINING_MAX_METERS + 1e-6) return true;
    }
  }
  return false;
}

/** False when a height-field slope or retaining wall forbids this footprint. Castle pads are exempt. */
export function lotFitsField(
  document: CityDocument,
  terrain: CityTerrain,
  lot: Pick<BuildingLot, "polygon" | "faceId">
): boolean {
  if (!terrain.field || !terrain.slopeAt) return true;
  if (castleFaceIds(document).has(lot.faceId)) return true;
  const center = polygonCentroid(lot.polygon);
  const slope = terrain.slopeAt(center);
  if (slope > UNBUILDABLE_SLOPE) return false;
  const level = terrain.foundationAt(lot.polygon);
  if (retainingExceeds(lot.polygon, level, terrain.heightAt)) return false;
  if (slope > STEEP_BUILDING_SLOPE && Math.abs(polygonArea(lot.polygon)) > SMALL_LOT_MAX_M2) return false;
  return true;
}

/** Mean height of a cell, for displays that still read the cell elevation. */
export function faceMeanElevation(ring: readonly Point[], sample: (point: Point) => number): number {
  if (!ring.length) return 1;
  let sum = 0;
  for (const point of ring) sum += sample(point);
  const center = polygonCentroid(ring as Point[]);
  return Math.max(1, Math.round(((sum / ring.length + sample(center)) / 2) * 10) / 10);
}

export function markUnbuildableSlopes(document: CityDocument, slopeAt: (point: Point) => number): void {
  const castle = castleFaceIds(document);
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "land" || castle.has(face.id)) continue;
    const center = polygonCentroid(facePoints(document.mesh, face));
    if (slopeAt(center) <= UNBUILDABLE_SLOPE) continue;
    face.properties.buildable = false;
    if (face.properties.ward !== "park" && face.properties.ward !== "farm" && face.properties.ward !== "cemetery")
      face.properties.ward = "empty";
  }
}
