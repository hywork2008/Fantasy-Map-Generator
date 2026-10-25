export interface HousingCapacityReport {
  /** Physical house counts, independent of display grouping. Present only for the new policy. */
  heightDistribution?: { inside: Record<string, number>; outside: Record<string, number> };
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
