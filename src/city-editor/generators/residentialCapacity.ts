import { URBAN_DWELLING_SIZE } from "../../utils/urbanDwellings";
import { residentialStoreys } from "../../utils/urbanMorphology";
import type { HousingCapacityReport } from "../types/contracts/residentialCapacity";
import type { CityDocument } from "../types/document";
import { applyBuildingHeightLimits, maximumBuildingStoreys } from "./buildingHeightLimits";
import { assignResidentialHeightDistribution, hasBuildingHeightVariation, heightPeriod } from "./buildingHeightPolicy";
import type { BuildingLot } from "./buildingLots.types";
import { isResidentialBuilding, residentialCapacity } from "./residentialCapacityFormula";

export { dwellingCapacity, isResidentialBuilding, residentialCapacity } from "./residentialCapacityFormula";

export function applyResidentialStoreys(document: CityDocument, lots: BuildingLot[]): BuildingLot[] {
  lots = applyBuildingHeightLimits(document, lots, hasBuildingHeightVariation(document));
  if (hasBuildingHeightVariation(document)) return assignResidentialHeightDistribution(document, lots);
  if (!document.urbanMorphology) return applyBuildingHeightLimits(document, lots);
  const profile = residentialStoreys(document.urbanMorphology.period);
  const preferred = document.urbanGrowth?.insideStoreys ?? profile.standard;
  return lots.map(lot => {
    if (lot.residentialCluster || !isResidentialBuilding(lot) || document.mesh.faces[lot.faceId]?.properties.locked)
      return lot;
    const face = document.mesh.faces[lot.faceId];
    const outside = face?.properties.settlement === "outskirts";
    return {
      ...lot,
      storeys: maximumBuildingStoreys(
        document,
        lot,
        outside ? Math.min(2, lot.storeys ?? 2) : Math.min(profile.maximum, preferred)
      ),
      residentialFloorShare: lot.residentialFloorShare ?? (lot.uses?.some(u => u !== "residential") ? 0.55 : 0.85)
    };
  });
}
export function measureHousingCapacity(
  document: CityDocument,
  lots: BuildingLot[],
  requiredDwellings: number
): HousingCapacityReport {
  let inside = 0,
    outside = 0,
    buildingsInside = 0,
    buildingsOutside = 0;
  const regionDwellings: Record<string, number> = {};
  const heightDistribution = hasBuildingHeightVariation(document)
    ? { inside: {} as Record<string, number>, outside: {} as Record<string, number> }
    : undefined;
  for (const lot of lots) {
    const settlement = document.mesh.faces[lot.faceId]?.properties.settlement;
    if (settlement !== "core" && settlement !== "outskirts") continue;
    if (heightDistribution && (lot.residentialCluster || isResidentialBuilding(lot))) {
      const histogram = settlement === "outskirts" ? heightDistribution.outside : heightDistribution.inside;
      for (const [key, count] of Object.entries(
        lot.residentialCluster?.templateCounts ?? { [`${lot.storeys ?? 1}f`]: 1 }
      )) {
        const storeys = key.split(":")[0].replace("f", "");
        histogram[storeys] = (histogram[storeys] ?? 0) + count;
      }
    }
    const capacity = residentialCapacity(lot);
    if (!capacity) continue;
    if (document.mesh.faces[lot.faceId]?.properties.settlement === "outskirts") {
      outside += capacity;
      buildingsOutside++;
      if (lot.growthRegionId)
        regionDwellings[lot.growthRegionId] = (regionDwellings[lot.growthRegionId] ?? 0) + capacity;
    } else {
      inside += capacity;
      buildingsInside++;
    }
  }
  const outsideCap = document.urbanGrowth?.outsideCap ?? requiredDwellings;
  const availableOutside = Math.min(outside, outsideCap);
  const desiredOutside = Math.min(availableOutside, document.urbanGrowth?.outsideBudget ?? 0);
  const assignedInside = Math.min(inside, Math.max(0, requiredDwellings - desiredOutside));
  const assignedOutside = Math.min(availableOutside, requiredDwellings - assignedInside);
  const unplacedDwellings = Math.max(0, requiredDwellings - assignedInside - assignedOutside);
  return {
    requiredDwellings,
    ...(heightDistribution ? { heightDistribution } : {}),
    capacityInside: inside,
    capacityOutside: outside,
    assignedInside,
    assignedOutside,
    unplacedDwellings,
    outsideCap,
    outsideShare: requiredDwellings ? assignedOutside / requiredDwellings : 0,
    buildingsInside,
    buildingsOutside,
    regionDwellings,
    reasons: [
      ...(heightDistribution &&
      Object.keys(heightDistribution.inside).length === 1 &&
      heightDistribution.inside[String(residentialStoreys(heightPeriod(document)).maximum)]
        ? ["height-variation-saturated"]
        : []),
      ...(outside > outsideCap ? ["locked-outside-capacity-exceeds-limit"] : []),
      ...(unplacedDwellings ? ["insufficient-eligible-residential-capacity"] : []),
      ...(document.urbanMorphology?.wallPhases.length && !document.urbanGrowth?.regions.length
        ? ["no-buildable-outside-approach"]
        : [])
    ]
  };
}
export function assignedPopulation(report: HousingCapacityReport): number {
  return (report.assignedInside + report.assignedOutside) * URBAN_DWELLING_SIZE;
}
