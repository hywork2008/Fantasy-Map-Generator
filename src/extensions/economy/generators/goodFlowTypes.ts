import type { FaunaCohorts } from "./faunaPopulationTypes";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";

export type GoodFlowDirection = "source" | "sink" | "transfer";
export type GoodFlowCategory =
  | "ruralHarvest"
  | "ruralCraft"
  | "clearanceSupply"
  | "mineSupply"
  | "smelterSupply"
  | "burgCraft"
  | "importArrival"
  | "householdFood"
  | "householdTextiles"
  | "householdHeating"
  | "livestockFeed"
  | "recipeInput"
  | "construction"
  | "smelting"
  | "minting"
  | "military"
  | "marketInvestment"
  | "shipbuilding"
  | "exportDeparture"
  | "spoilage"
  | "burgDemand"
  | "funeral"
  | "navyExport"
  | "navyImport"
  | "luxuryPurchase"
  | "characterLuxury"
  /** Timber recovered by breaking up a one-way river craft at its destination. */
  | "vesselSalvage"
  /** Finished weapons stolen from an unsold market stock (armsTheft.ts). */
  | "theft";

export interface GoodFlowRecord {
  /** Recorded source cell; absent for legacy stock, imports and unknown origins. */
  readonly livestockSourceCellId?: number;
  readonly livestockCohorts?: FaunaCohorts | null;
  /** Persistent transit-lot references; filled on export, consumed on arrival/loss. */
  readonly livestockCargoIds?: string[];
  /** Explicit live ownership transfer, never inferred from a recipe purchase. */
  readonly livestockBuyerId?: string;
  readonly livestockSellerId?: string;
  readonly livestockOwnerOpeningUnits?: number;
  readonly livestockOwnerLocationId?: string;
  readonly direction: GoodFlowDirection;
  readonly category: GoodFlowCategory;
  readonly goodId: number;
  readonly units: number;
  readonly marketId?: number;
  readonly burgId?: number;
  readonly guildDomain?: CraftKnowledgeDomain;
  /** Recipe output Good when this is a manufacturing input. */
  readonly relatedGoodId?: number;
}
