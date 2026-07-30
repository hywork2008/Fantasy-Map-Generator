export const MILITARY_RESOURCES = [
  "iron",
  "lead",
  "gunpowder",
  "saltpeter",
  "sulfur",
  "coal",
  "fodder",
  "arrows",
  "bullets"
] as const;
export type MilitaryResource = (typeof MILITARY_RESOURCES)[number];

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
