import { URBAN_DWELLING_SIZE } from "../../../utils/urbanDwellings";
import { residentialStoreys } from "../../../utils/urbanMorphology";
import type { CityDocument } from "../types";
import type { BuildingLot } from "./buildingLots";
import { polygonArea } from "./geom";

export interface HousingCapacityReport {
  requiredDwellings: number;
  capacityInside: number;
  capacityOutside: number;
  assignedInside: number;
  assignedOutside: number;
  unplacedDwellings: number;
  outsideCap: number;
  outsideShare: number;
  buildingsInside: number;
  buildingsOutside: number;
  regionDwellings: Record<string, number>;
  reasons: string[];
}
export function isResidentialBuilding(lot: BuildingLot): boolean {
  return !lot.landmark && (!lot.role || lot.role === "main") && (!lot.uses || lot.uses.includes("residential"));
}
export function residentialCapacity(lot: BuildingLot): number {
  if (!isResidentialBuilding(lot)) return 0;
  const share = lot.residentialFloorShare ?? (lot.uses?.some(u => u !== "residential") ? 0.55 : 0.85);
  return Math.max(0, Math.floor((Math.abs(polygonArea(lot.polygon)) * (lot.storeys ?? 1) * share * 0.75) / 40));
}
export function applyResidentialStoreys(document: CityDocument, lots: BuildingLot[]): BuildingLot[] {
  if (!document.urbanMorphology) return lots;
  const profile = residentialStoreys(document.urbanMorphology.period);
  const preferred = document.urbanGrowth?.insideStoreys ?? profile.standard;
  return lots.map(lot => {
    if (!isResidentialBuilding(lot) || document.mesh.faces[lot.faceId]?.properties.locked) return lot;
    const face = document.mesh.faces[lot.faceId];
    const outside = face?.properties.settlement === "outskirts";
    return {
      ...lot,
      storeys: outside ? Math.min(2, lot.storeys ?? 2) : Math.min(profile.maximum, preferred),
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
  for (const lot of lots) {
    const settlement = document.mesh.faces[lot.faceId]?.properties.settlement;
    if (settlement !== "core" && settlement !== "outskirts") continue;
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
