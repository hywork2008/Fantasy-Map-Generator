import { residentialStoreys } from "../../utils/urbanMorphology";
import type { BuildingHeightLimit } from "../types/contracts/buildingHeightLimits";
import type { CityDocument } from "../types/document";
import { buildingFloorSpecs } from "./buildingFloors";
import type { BuildingLot } from "./buildingLots.types";
import { pointInPolygon, polygonCentroid } from "./geom";
import { dwellingCapacity, isResidentialBuilding } from "./residentialCapacityFormula";

export function validBuildingHeightLimit(value: unknown): value is BuildingHeightLimit | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const limit = value as BuildingHeightLimit;
  return (
    (limit.maxStoreys === undefined ||
      (Number.isInteger(limit.maxStoreys) && limit.maxStoreys >= 0 && limit.maxStoreys <= 200)) &&
    (limit.maxHeightMeters === undefined ||
      (Number.isFinite(limit.maxHeightMeters) && limit.maxHeightMeters >= 0 && limit.maxHeightMeters <= 2000))
  );
}
export function sameBuildingHeightLimit(a?: BuildingHeightLimit, b?: BuildingHeightLimit): boolean {
  return a?.maxStoreys === b?.maxStoreys && a?.maxHeightMeters === b?.maxHeightMeters;
}

export function stricterHeightLimit(a?: BuildingHeightLimit, b?: BuildingHeightLimit): BuildingHeightLimit {
  const min = (x?: number, y?: number) => (x === undefined ? y : y === undefined ? x : Math.min(x, y));
  return {
    maxStoreys: min(a?.maxStoreys, b?.maxStoreys),
    maxHeightMeters: min(a?.maxHeightMeters, b?.maxHeightMeters)
  };
}
export function effectiveHeightLimit(document: CityDocument, faceId: string): BuildingHeightLimit {
  return stricterHeightLimit(
    document.buildingHeightLimit,
    document.mesh?.faces?.[faceId]?.properties.buildingHeightLimit
  );
}
export function maximumBuildingStoreys(
  document: CityDocument,
  lot: BuildingLot,
  maximum: number,
  varied = false
): number {
  const limit = effectiveHeightLimit(document, lot.faceId);
  let allowed = Math.max(0, Math.min(maximum, limit.maxStoreys ?? maximum));
  if (limit.maxHeightMeters !== undefined) {
    while (
      allowed > 0 &&
      buildingFloorSpecs(
        document,
        lot,
        allowed,
        varied && (isResidentialBuilding(lot) || !!lot.residentialCluster)
      ).reduce((sum, floor) => sum + floor.heightMeters, 0) +
        0.15 >
        limit.maxHeightMeters
    )
      allowed--;
  }
  return allowed;
}
/** Final safety pass also reconciles coarse-display capacity when a height cap was edited. */
export function applyBuildingHeightLimits(
  document: CityDocument,
  lots: readonly BuildingLot[],
  varied = false
): BuildingLot[] {
  return lots.map(lot => {
    if (lot.landmark) return lot;
    const limit = effectiveHeightLimit(document, lot.faceId);
    if (limit.maxHeightMeters === undefined && limit.maxStoreys === undefined) return lot;
    const fallback = isResidentialBuilding(lot)
      ? 1
      : lot.role === "shed" || lot.role === "stable"
        ? 1
        : lot.role === "store" || lot.archetype === "warehouse-compound" || lot.archetype === "port-workyard"
          ? 3
          : 2;
    const original =
      lot.storeys ??
      Math.min(
        fallback,
        residentialStoreys(document.urbanMorphology?.period ?? document.historicalPeriod ?? "ageOfExploration").maximum
      );
    const storeys = maximumBuildingStoreys(document, lot, original, varied);
    if (storeys === original && lot.storeys !== undefined) return lot;
    if (!lot.residentialCluster) return { ...lot, storeys };
    const cluster = lot.residentialCluster;
    const templates: Record<string, number> = {};
    let capacity = 0;
    for (const [key, count] of Object.entries(cluster.templateCounts)) {
      const footprint = key.split(":")[1];
      const nextKey = `${storeys}f:${footprint}`;
      templates[nextKey] = (templates[nextKey] ?? 0) + count;
      capacity += count * dwellingCapacity(Number(footprint), storeys, lot.residentialFloorShare);
    }
    return {
      ...lot,
      storeys,
      residentialCluster: {
        ...cluster,
        templateCounts: templates,
        capacityDwellings: capacity,
        assignedDwellings: Math.min(capacity, cluster.assignedDwellings)
      }
    };
  });
}

export function hasBuildingHeightLimits(document: CityDocument): boolean {
  return (
    document.buildingHeightLimit !== undefined ||
    Object.values(document.mesh?.faces ?? {}).some(face => face.properties.buildingHeightLimit !== undefined)
  );
}

/** Replays keep cell zoning; when a finished cell maps to a coarser input cell, keep the stricter cap. */
export function inheritBuildingHeightLimits(target: CityDocument, current: CityDocument): CityDocument {
  if (target.mesh === current.mesh) return { ...target, buildingHeightLimit: current.buildingHeightLimit };
  const zones = Object.values(current.mesh.faces).filter(face => face.properties.buildingHeightLimit !== undefined);
  const old = Object.values(target.mesh.faces).some(face => face.properties.buildingHeightLimit !== undefined);
  if (!zones.length && !old) return { ...target, buildingHeightLimit: current.buildingHeightLimit };
  const points = (city: CityDocument, face: CityDocument["mesh"]["faces"][string]) =>
    face.boundary.map(ref => {
      const edge = city.mesh.edges[ref.edgeId];
      return city.mesh.vertices[ref.forward ? edge.a : edge.b].point;
    });
  const faces = Object.fromEntries(
    Object.entries(target.mesh.faces).map(([id, face]) => [
      id,
      { ...face, properties: { ...face.properties, buildingHeightLimit: undefined as BuildingHeightLimit | undefined } }
    ])
  );
  for (const zone of zones) {
    const center = polygonCentroid(points(current, zone));
    const preferred = faces[zone.id];
    const face =
      preferred && pointInPolygon(center, points(target, preferred))
        ? preferred
        : Object.values(faces).find(face => pointInPolygon(center, points(target, face)));
    if (face)
      face.properties.buildingHeightLimit = stricterHeightLimit(
        face.properties.buildingHeightLimit,
        zone.properties.buildingHeightLimit
      );
  }
  return { ...target, buildingHeightLimit: current.buildingHeightLimit, mesh: { ...target.mesh, faces } };
}
