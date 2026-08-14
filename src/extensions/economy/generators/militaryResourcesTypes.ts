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
  "bullets",
  "muskets"
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

/** Finished ammunition that a State owns and can expend only through an explicit military action. */
export type MilitaryConsumableResource = "arrows" | "bullets" | "gunpowder";
export type MilitaryConsumableStock = Partial<Record<MilitaryConsumableResource, number>>;

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
  /** Finished military supplies delivered during the last production cycle. */
  lastDelivered?: MilitaryConsumableStock;
  /** Persistent State-owned ammunition reserve. Older saves are migrated lazily as empty stock. */
  consumableStock?: MilitaryConsumableStock;
  /** Direct demand not met by a market, or the remaining consumable stockpile gap. */
  unmetDemand: ResourceAmounts;
}
