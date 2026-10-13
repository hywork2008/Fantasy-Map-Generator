/** How the occupancy fit went; used by the housing batch survey. */
export interface HousingFitStats {
  dwellings: number;
  capacityBased?: boolean;
  /** Culture Lot occupancy guide the fit starts from (0–1). */
  targetOccupancy: number;
  /** Why the fit did not run; absent when it ran. */
  skipped?: string;
  /** Districts whose occupancy the fit may scale. */
  districts: number;
  /** Houses drawn at the guide occupancy. */
  initialHouses: number | null;
  finalHouses: number | null;
  /** Multiplier applied to the core districts' default occupancy; the guide is the first. */
  factor: number;
  /** Multiplier applied to the between-walls districts (double walls); equals `factor` otherwise. */
  betweenFactor: number;
  /** Multiplier applied to the outskirts districts' default occupancy. */
  outskirtsFactor: number;
  /** True when the outskirts were opened for suburb blocks. */
  suburbs: boolean;
  /** Houses per zone in the kept sample (old town, between the walls, outskirts). */
  finalZones?: ZoneCounts;
  /** Rebuilds after the initial count, each `[core factor, outskirts factor, houses]`. */
  samples: Array<[number, number, number]>;
}

export type ZoneCounts = Record<Zone, number>;

/** `core` is the old town of a double-walled town (wallRing 0) or the whole
 * walled town otherwise; `between` lies between the two curtains. */
export type Zone = "core" | "between" | "outskirts";
