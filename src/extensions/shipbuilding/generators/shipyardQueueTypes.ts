import type { ShipbuildingMaterialBlockedReason, ShipbuildingMaterialShortage } from "../../hostTypes";

export type ShipyardOwner = "state" | "market" | "shipyard";
type ShipHullOwner = Exclude<ShipyardOwner, "shipyard">;

export interface ShipyardQueueEntry {
  shipClassId: string;
  owner: ShipHullOwner;
  progress: number;
  /** Potential work accumulated since the last material request, not yet construction progress. */
  pendingWorkPoints: number;
  blockedReason?: ShipbuildingMaterialBlockedReason;
  missingMaterials?: ShipbuildingMaterialShortage;
}

export interface SurplusShipyardQueueEntry extends Omit<ShipyardQueueEntry, "owner"> {
  owner: "shipyard";
}

export type ShipHullStatus = "docked" | "voyage";

/**
 * A single completed hull. `ownerId` is a stateId for `owner: "state"` (navy hulls are
 * pooled at the state level, matching `_completedHulls`'s existing key scheme) or a
 * burgId for `owner: "market"`. `homeBurgId` is always the burg that built it — hulls
 * don't relocate to other ports in this model. `status` tracks whether it currently
 * occupies a port berth (`"docked"`) or is out on a trade/training voyage (`"voyage"`,
 * see `shipVoyages.ts` and docs/plan/ships.md "航海訓練・偽装通商・諜報（暫定案）").
 */
export interface ShipHull {
  id: number;
  shipClassId: string;
  owner: ShipHullOwner;
  ownerId: number;
  homeBurgId: number;
  status: ShipHullStatus;
}
