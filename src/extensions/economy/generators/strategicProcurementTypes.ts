export type ProcurementOrderStatus = "open" | "assigned" | "inTransit" | "fulfilled" | "blocked" | "cancelled";
export type ProcurementOrderBlockedReason = "noDomesticSupply" | "foreignPolicy" | "noRoute" | "insufficientTreasury";

export interface ProcurementOrder {
  id: number;
  stateId: number;
  destinationMarketId: number;
  goodId: number;
  requestedUnits: number;
  fulfilledUnits: number;
  maxLandedUnitPrice: number;
  status: ProcurementOrderStatus;
  sourceMarketId?: number;
  caravanId?: number;
  blockedReason?: ProcurementOrderBlockedReason;
  /** Shipbuilding demand signals received while the order remains unfulfilled. */
  priorityCycles?: number;
}
