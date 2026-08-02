/** Functional lodging categories. Presentation never changes their capacity or economy rules. */
export const INN_CLASSES = ["wayside", "market", "waterside", "grand", "caravanserai"] as const;

export type InnClass = (typeof INN_CLASSES)[number];

/**
 * World-wide visual language for commercial lodging. It is presentation-only so maps can switch
 * from a Central European reading to a fantasy or JRPG reading without rebalancing facilities.
 */
export const LODGING_STYLES = ["medievalCentralEuropean", "highFantasy", "jrpg"] as const;

export type LodgingStyle = (typeof LODGING_STYLES)[number];

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

/** A temporary, adult-only lodging cohort measured in population points. */
export interface InnTemporaryLodgerCohort {
  originCell: number;
  originState: number;
  maleAdults: number;
  femaleAdults: number;
  /** Absolute simulation month at which this group must find permanent housing or leave. */
  deadlineMonth: number;
}

/**
 * Per-burg short-stay occupancy. transientGuests are actual people; temporary lodger cohorts
 * retain population-point and origin data so expiry can return them to the mobile-cohort flow.
 */
export interface InnStayLedger {
  burgId: number;
  transientGuests: number;
  temporaryLodgerCohorts: InnTemporaryLodgerCohort[];
}
