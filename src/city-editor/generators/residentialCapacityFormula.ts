import type { BuildingLot } from "./buildingLots.types";
import { polygonArea } from "./geom";

export function isResidentialBuilding(lot: BuildingLot): boolean {
  return !lot.landmark && (!lot.role || lot.role === "main") && (!lot.uses || lot.uses.includes("residential"));
}
export function dwellingCapacity(footprintM2: number, storeys: number, residentialShare = 0.85): number {
  return Math.max(0, Math.floor((footprintM2 * storeys * residentialShare * 0.75) / 40));
}
export function residentialCapacity(lot: BuildingLot): number {
  if (lot.residentialCluster) return lot.residentialCluster.capacityDwellings;
  if (!isResidentialBuilding(lot)) return 0;
  const share = lot.residentialFloorShare ?? (lot.uses?.some(use => use !== "residential") ? 0.55 : 0.85);
  return dwellingCapacity(Math.abs(polygonArea(lot.polygon)), lot.storeys ?? 1, share);
}
