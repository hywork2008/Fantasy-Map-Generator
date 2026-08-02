/** Functional lodging categories. Presentation style is intentionally deferred from simulation data. */
export const INN_CLASSES = ["wayside", "market", "waterside", "grand", "caravanserai"] as const;

export type InnClass = (typeof INN_CLASSES)[number];

/**
 * Aggregate physical lodging stock for one class in one Burg. A record represents a class of
 * buildings, not an individually named inn, which keeps the settlement simulation lightweight.
 */
export interface InnFacility {
  burgId: number;
  innClass: InnClass;
  buildingCount: number;
  privateRooms: number;
  sharedBeds: number;
  privateBeds: number;
  commonSeats: number;
  stableSpaces: number;
  /** Durable condition from 0 (derelict) to 1 (well maintained). v1 seeds it only. */
  condition: number;
}

export interface InnFacilityTotals {
  buildingCount: number;
  privateRooms: number;
  beds: number;
  commonSeats: number;
  stableSpaces: number;
}

/**
 * A separate, non-dwelling construction work order for one additional inn building.
 * Materials are acquired gradually; the completed building is folded into InnFacility.
 */
export interface InnConstructionOrder {
  burgId: number;
  innClass: InnClass;
  startedYear: number;
  laborProgress: number;
  woodAcquired: number;
  masonryAcquired: number;
}
