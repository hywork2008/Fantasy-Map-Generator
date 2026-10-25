import type { CityDocument } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import { hasBuildingHeightLimits } from "../buildingHeightLimits";
import { hasBuildingHeightVariation, sampleResidentialStoreys } from "../buildingHeightPolicy";
import type { BuildingLot } from "../buildingLots.types";
import { polygonArea } from "../geom";
import { dwellingCapacity, isResidentialBuilding, residentialCapacity } from "../residentialCapacityFormula";
import { townExtentMeters } from "../settlementExtent";

/** Measure the sampled low-rise fabric, before any population-pressure increase in storeys. */
export function initialHeightCapacity(document: CityDocument, lots: readonly BuildingLot[]): number {
  let inside = 0,
    outside = 0;
  for (const lot of lots) {
    const face = document.mesh.faces[lot.faceId];
    const settlement = face?.properties.settlement;
    if (!isResidentialBuilding(lot) || (settlement !== "core" && settlement !== "outskirts")) continue;
    let capacity: number;
    if (face.properties.locked) capacity = residentialCapacity(lot);
    else if (lot.residentialCluster) {
      const storeys = hasBuildingHeightVariation(document)
        ? sampleResidentialStoreys(document, lot)
        : (lot.storeys ?? 1);
      capacity = Object.entries(lot.residentialCluster.templateCounts).reduce(
        (sum, [key, count]) =>
          sum + count * dwellingCapacity(Number(key.split(":")[1]), storeys, lot.residentialFloorShare),
        0
      );
    } else
      capacity = dwellingCapacity(
        Math.abs(polygonArea(lot.polygon)),
        hasBuildingHeightVariation(document) ? sampleResidentialStoreys(document, lot) : (lot.storeys ?? 1),
        lot.residentialFloorShare
      );
    if (settlement === "core") inside += capacity;
    else outside += capacity;
  }
  return inside + Math.min(outside, document.urbanGrowth?.outsideBudget ?? 0, document.urbanGrowth?.outsideCap ?? 0);
}

/** Automatic generation expands the core first. Locked geometry and imported terrain bound expansion. */
export function nextHousingAreaScale(
  source: CityDocument,
  result: CityDocument,
  settings: GenerationSettings,
  lots: readonly BuildingLot[]
): number | undefined {
  if (
    (!hasBuildingHeightVariation(result) && !hasBuildingHeightLimits(result)) ||
    (settings.housingAreaPasses ?? 0) >= 3 ||
    settings.population?.frameMode === "manual" ||
    source.landmarks?.length ||
    Object.values(source.mesh.faces).some(face => face.properties.locked) ||
    Object.values(source.mesh.vertices).some(vertex => vertex.locked) ||
    Object.values(source.mesh.edges).some(edge => edge.locked) ||
    source.featureGroups.some(group => group.locked) ||
    source.elements.some(element => element.locked)
  )
    return undefined;
  const required =
    result.populationPlan?.requiredDwellings ??
    result.urbanGrowth?.requiredDwellings ??
    settings.descriptor?.burg.dwellings;
  if (
    !required ||
    result.buildingHeightLimit?.maxStoreys === 0 ||
    (result.buildingHeightLimit?.maxHeightMeters ?? Infinity) < 3
  )
    return undefined;
  const capacity = initialHeightCapacity(result, lots);
  if (capacity >= required) return undefined;
  const current = settings.housingAreaScale ?? 1;
  let maximum = 64;
  if (settings.descriptor)
    maximum = Math.min(
      maximum,
      (townExtentMeters(source.frame) / 2.6 / settings.descriptor.frame.cityRadiusMeters) ** 2
    );
  if (
    !settings.descriptor &&
    result.populationPlan &&
    Object.values(source.mesh.faces).some(face => face.properties.buildingHeightLimit !== undefined)
  )
    maximum = Math.min(
      maximum,
      (townExtentMeters(source.frame) / 2.6 / (result.populationPlan.cityRadiusMeters / Math.sqrt(current))) ** 2
    );
  const next = Math.min(maximum, current * Math.min(4, (required / Math.max(1, capacity)) * 1.08));
  return next > current * 1.02 ? next : undefined;
}
