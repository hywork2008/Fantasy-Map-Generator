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

export type ShipHullStatus = "docked" | "voyage" | "cargo" | "maintenance";

/**
 * Operational duty for itinerary display and income rules
 * (docs/plan/vessel-itinerary-and-finite-trade-fleet.md P1).
 */
export type ShipHullDuty = "idle" | "loading" | "cargo" | "ballast" | "patrol" | "overseas";

/**
 * A single completed hull. `ownerId` is a stateId for `owner: "state"` (navy hulls are
 * pooled at the state level, matching `_completedHulls`'s existing key scheme) or a
 * burgId for `owner: "market"`. `homeBurgId` is the ownership / home shipyard port.
 * `currentBurgId` / `nextBurgId` track live position for finite trade fleets
 * (docs/plan/vessel-itinerary-and-finite-trade-fleet.md).
 */
export interface ShipHull {
  id: number;
  shipClassId: string;
  owner: ShipHullOwner;
  ownerId: number;
  homeBurgId: number;
  status: ShipHullStatus;
  /** Shipbuilding-owned recovery timer used after an Economy cargo loss. */
  maintenanceDays?: number;
  /** Port the hull is currently berthed at; null while at sea. */
  currentBurgId?: number | null;
  /** Next port of call while on a cargo / ballast leg; null when idle. */
  nextBurgId?: number | null;
  /** Economy Caravan id while reserved for cargo; null otherwise. */
  caravanId?: number | null;
  /** 0..1 route progress projected from the bound Caravan. */
  routeProgress?: number;
  /** High-level duty label for UI and voyage-income gating. */
  duty?: ShipHullDuty;
  /** OverseasRelations expedition id while a state navy hull is escorting a convoy. */
  overseasExpeditionId?: number | null;
}
