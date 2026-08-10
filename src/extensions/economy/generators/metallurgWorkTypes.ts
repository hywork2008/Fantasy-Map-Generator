/** A compact owner reference; equipment remains aggregate rather than per-person state. */
export type MetallurgOwnerKind = "state" | "burg";

/** Why a job exists determines who may pre-empt it in later fulfillment phases. */
export type MetallurgWorkOrderKind = "newBuild" | "replacement" | "maintenance" | "consumable";

export type MetallurgWorkOrderStatus = "queued" | "waitingMaterials" | "inProgress" | "completed";

/**
 * Durable equipment and household metalwork held by one State or Burg.
 * `serviceableUnits` is seeded to the generated world's existing demand so enabling the
 * feature does not invent a one-time, world-sized armament deficit.
 */
export interface MetallurgAssetLedger {
  ownerKind: MetallurgOwnerKind;
  ownerId: number;
  productGoodId: number;
  targetUnits: number;
  serviceableUnits: number;
  maintenanceBacklogWork: number;
  lastSettledMonth: number;
}

/** A recipe input already expressed in Economy Good units. */
export interface MetallurgMaterialRequirement {
  goodId: number;
  units: number;
}

/**
 * One aggregate line of work, never an individual sword, soldier, or household item.
 * Phase 1 records demand only: no market stock or finished Goods are consumed yet.
 */
export interface MetallurgWorkOrder {
  id: number;
  ownerKind: MetallurgOwnerKind;
  ownerId: number;
  destinationMarketId: number;
  productGoodId: number;
  kind: MetallurgWorkOrderKind;
  /** The selected alternative in Good.recipes; keeps a future BOM stable after intake. */
  recipeIndex: number;
  requestedUnits: number;
  completedUnits: number;
  plannedWork: number;
  completedWork: number;
  materials: MetallurgMaterialRequirement[];
  status: MetallurgWorkOrderStatus;
  createdMonth: number;
  updatedMonth: number;
}

/** Market-level projection from all open Metallurg work orders. */
export interface MetallurgMaterialForecast {
  marketId: number;
  goodId: number;
  requiredUnits: number;
  availableMarketStock: number;
  inboundUnits: number;
  projectedShortage: number;
  workOrderIds: number[];
}
