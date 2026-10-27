import type { CityDocument } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import { hasBuildingHeightLimits, maximumBuildingStoreys } from "../buildingHeightLimits";
import {
  hasBuildingHeightVariation,
  heightPeriod,
  residentialHeightWeights,
  sampleResidentialStoreys
} from "../buildingHeightPolicy";
import type { BuildingLot } from "../buildingLots.types";
import { polygonArea } from "../geom";
import { dwellingCapacity, isResidentialBuilding, residentialCapacity } from "../residentialCapacityFormula";
import { innerWalledAreaShare, townExtentMeters } from "../settlementExtent";
import { importedRoadsForSite } from "../site/importedRoads";

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

/** A cheap first reservation using the same 80 m² house and net residential
 * coverage as population planning. The detailed fabric still measures and
 * corrects this estimate. Explicit scales are recipe inputs, never re-estimated. */
export function initialHousingAreaScale(source: CityDocument, settings: GenerationSettings): number | undefined {
  const site = settings.descriptor;
  if (
    !site?.urbanMorphology ||
    settings.population ||
    settings.housingAreaScale !== undefined ||
    !canExpandHousingArea(source, settings)
  )
    return undefined;
  const document = {
    ...source,
    buildingHeightPolicy: settings.buildingHeightPolicy,
    buildingHeightLimit: settings.buildingHeightLimit,
    urbanMorphology: site.urbanMorphology,
    civilization: site.civilization,
    historicalPeriod: settings.historicalPeriod ?? site.historicalPeriod
  };
  if (!hasBuildingHeightVariation(document)) return undefined;
  const lot: BuildingLot = { faceId: "", polygon: [], landmark: false };
  const capacity = residentialHeightWeights(heightPeriod(document), "ordinary").reduce(
    (sum, weight, index) => sum + weight * dwellingCapacity(80, maximumBuildingStoreys(document, lot, index + 1, true)),
    0
  );
  if (!capacity || !site.burg.dwellings) return undefined;
  const residentialArea = ((site.burg.dwellings / capacity) * 80) / 0.27;
  let area = residentialArea;
  const access = site.burg.waterAccess;
  const radius = Math.sqrt(residentialArea / Math.PI);
  const bankDistance = site.burg.riverPlacement?.bankDistanceMeters;
  const shoreDistance = site.waterbody?.shoreDistanceMeters;
  if (
    settings.townWallRings === "double" &&
    site.burg.walls &&
    site.burg.citadel &&
    site.burg.riverPlacement?.coastConstrained &&
    access?.river &&
    access.sea &&
    typeof bankDistance === "number" &&
    bankDistance >= 0 &&
    bankDistance <= radius &&
    typeof shoreDistance === "number" &&
    shoreDistance >= 0 &&
    shoreDistance <= radius &&
    (!settings.config.wall?.coast || settings.config.wall.coast === "auto" || settings.config.wall.coast === "open") &&
    importedRoadsForSite(site).filter(road => road.riverLanding).length >= 2
  ) {
    // Reserve one block around the inner curtain for its gates and approach
    // streets. Multiple river landings concentrate their approach streets on
    // the landward side, where a citadel also competes for residential land.
    // A single landing is already covered by the ordinary residential estimate;
    // any remaining shortfall is still measured from the generated fabric.
    const share = innerWalledAreaShare(settings.walledAreaShare, townExtentMeters(source.frame));
    area += 2 * Math.PI * radius * Math.sqrt(share) * source.frame.blockSizeMeters;
  }
  const scale = Math.min(
    maximumHousingAreaScale(source, settings),
    area / (Math.PI * site.frame.cityRadiusMeters ** 2)
  );
  return scale > 1.02 ? scale : undefined;
}

function canExpandHousingArea(source: CityDocument, settings: GenerationSettings): boolean {
  return !(
    (settings.housingAreaPasses ?? 0) >= 3 ||
    settings.population?.frameMode === "manual" ||
    source.landmarks?.length ||
    Object.values(source.mesh.faces).some(face => face.properties.locked) ||
    Object.values(source.mesh.vertices).some(vertex => vertex.locked) ||
    Object.values(source.mesh.edges).some(edge => edge.locked) ||
    source.featureGroups.some(group => group.locked) ||
    source.elements.some(element => element.locked)
  );
}

function maximumHousingAreaScale(source: CityDocument, settings: GenerationSettings): number {
  return settings.descriptor
    ? Math.min(64, (townExtentMeters(source.frame) / 2.6 / settings.descriptor.frame.cityRadiusMeters) ** 2)
    : 64;
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
    !canExpandHousingArea(source, settings)
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
  let maximum = maximumHousingAreaScale(source, settings);
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
