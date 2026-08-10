export const MILITARY_RESOURCES = [
  "iron",
  "lead",
  "gunpowder",
  "saltpeter",
  "sulfur",
  "coal",
  "fodder",
  "arms",
  "arrows",
  "bullets"
] as const;
export type MilitaryResource = (typeof MILITARY_RESOURCES)[number];

/**
 * Fodder demand for mounted units, in Fodder Goods-units per mounted head per year. Shared
 * between militaryResources.ts (drives the free market stock draw settled monthly) and
 * militaryLogistics.ts (monetizes the same rate into the state's treasury upkeep). Uncalibrated —
 * not yet kg-grounded the way Grain/GROSS_FOOD_NEED was (see agriculturalLandUse.ts).
 */
export const MOUNTED_FODDER_PER_HEAD = 0.08;

type ResourceAmounts = Partial<Record<MilitaryResource, number>>;

/**
 * State demand for the materials consumed by artillery and firearm units.
 * Values use Economy Good units, rather than historical tonnes, so they can be
 * compared directly with market stock and mine output.
 */
export interface MilitaryResourceLedger {
  stateId: number;
  supplyMarketId: number | null;
  annualDemand: ResourceAmounts;
  /** Direct inputs actually taken from the state market in the last production cycle. */
  lastConsumed: ResourceAmounts;
  /** Demand not met by local market reserves in the last production cycle. */
  unmetDemand: ResourceAmounts;
}
