export type ProcurementOrderStatus = "open" | "assigned" | "inTransit" | "fulfilled" | "blocked" | "cancelled";
export type ProcurementOrderBlockedReason = "noDomesticSupply" | "foreignPolicy" | "noRoute" | "insufficientTreasury";
/** The demand system that owns this state-funded material movement. */
export type ProcurementOrderPurpose = "shipbuilding" | "metallurg";

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
  /** Demand signals received while the order remains unfulfilled. */
  priorityCycles?: number;
  /** Omitted on older saves; those orders are shipbuilding orders. */
  purpose?: ProcurementOrderPurpose;
}
