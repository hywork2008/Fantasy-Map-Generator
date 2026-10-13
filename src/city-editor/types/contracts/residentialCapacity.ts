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
