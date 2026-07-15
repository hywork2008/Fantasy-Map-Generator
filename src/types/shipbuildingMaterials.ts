/** Materials that a Shipbuilding queue must draw from its local Economy market. */
export const SHIPBUILDING_MATERIAL_IDS = ["Wood", "Sails", "Ropes", "Tar"] as const;

export type ShipbuildingMaterialId = (typeof SHIPBUILDING_MATERIAL_IDS)[number];

export type ShipbuildingMaterials = Readonly<Record<ShipbuildingMaterialId, number>>;

export type ShipbuildingMaterialShortage = Partial<Record<ShipbuildingMaterialId, number>>;

export type ShipbuildingMaterialBlockedReason =
  | "economyUnavailable"
  | "noMarket"
  | "missingGood"
  | "insufficientMaterials";

export type ShipbuildingMaterialRequestResult =
  | { status: "fulfilled" }
  | { status: Exclude<ShipbuildingMaterialBlockedReason, "insufficientMaterials"> }
  | { status: "insufficientMaterials"; missing: ShipbuildingMaterialShortage };

/**
 * Mutable synchronous CustomEvent detail shared by Shipbuilding (requester) and Economy
 * (responder). The responder must either fulfill every material or mutate nothing.
 */
export interface ShipbuildingMaterialRequest {
  burgId: number;
  marketId: number;
  shipClassId: string;
  owner: "state" | "market";
  workPoints: number;
  materials: ShipbuildingMaterials;
  result?: ShipbuildingMaterialRequestResult;
}

/**
 * Read-only demand signal emitted by a state-owned Shipbuilding queue. Economy
 * resolves the named materials to its own Good ids and owns every later mutation:
 * policy, order, treasury payment, Deal, and Caravan.
 */
export interface ShipbuildingStrategicProcurementDemand {
  source: "shipbuilding";
  stateId: number;
  destinationMarketId: number;
  annualMaterials: ShipbuildingMaterials;
}

export type ShipbuildingProcurementBlockedReason =
  | "noDomesticSupply"
  | "foreignPolicy"
  | "noRoute"
  | "insufficientTreasury";

export interface ShipbuildingProcurementStatus {
  material: ShipbuildingMaterialId;
  inTransit: number;
  sourceStateId: number | null;
  blockedReason?: ShipbuildingProcurementBlockedReason;
}

/** Mutable synchronous query detail used only for Shipbuilding's read-only Overview. */
export interface ShipbuildingProcurementStatusRequest {
  stateId: number;
  destinationMarketId: number;
  result?: ShipbuildingProcurementStatus[];
}

export function isShipbuildingMaterialRequest(value: unknown): value is ShipbuildingMaterialRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ShipbuildingMaterialRequest>;
  if (
    !Number.isInteger(request.burgId) ||
    !Number.isInteger(request.marketId) ||
    typeof request.shipClassId !== "string" ||
    (request.owner !== "state" && request.owner !== "market") ||
    typeof request.workPoints !== "number" ||
    !Number.isFinite(request.workPoints) ||
    request.workPoints <= 0 ||
    !request.materials ||
    typeof request.materials !== "object"
  ) {
    return false;
  }

  return SHIPBUILDING_MATERIAL_IDS.every(material => {
    const amount = request.materials?.[material];
    return typeof amount === "number" && Number.isFinite(amount) && amount >= 0;
  });
}

/**
 * One-shot, generation-time warm-up signal (docs/plan/shipbuilding-industrial-policy.md §4.6).
 * Reuses ShipbuildingStrategicProcurementDemand's shape but, unlike the per-shipyard/per-tick
 * demand notifications, is dispatched once per new map, already aggregated by (state, market).
 * The listener must only seed market stock directly — never spend treasury or spawn Caravans/
 * ProcurementOrders, which is what the reactive demand handler does with the same-shaped data.
 */
export interface ShipbuildingInitialStockRequest {
  source: "shipbuilding";
  demands: readonly ShipbuildingStrategicProcurementDemand[];
}

export function isShipbuildingStrategicProcurementDemand(
  value: unknown
): value is ShipbuildingStrategicProcurementDemand {
  if (!value || typeof value !== "object") return false;
  const demand = value as Partial<ShipbuildingStrategicProcurementDemand>;
  if (
    demand.source !== "shipbuilding" ||
    typeof demand.stateId !== "number" ||
    !Number.isInteger(demand.stateId) ||
    demand.stateId <= 0 ||
    typeof demand.destinationMarketId !== "number" ||
    !Number.isInteger(demand.destinationMarketId) ||
    demand.destinationMarketId <= 0 ||
    !demand.annualMaterials ||
    typeof demand.annualMaterials !== "object"
  ) {
    return false;
  }

  return SHIPBUILDING_MATERIAL_IDS.every(material => {
    const amount = demand.annualMaterials?.[material];
    return typeof amount === "number" && Number.isFinite(amount) && amount >= 0;
  });
}

export function isShipbuildingInitialStockRequest(value: unknown): value is ShipbuildingInitialStockRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ShipbuildingInitialStockRequest>;
  return (
    request.source === "shipbuilding" &&
    Array.isArray(request.demands) &&
    request.demands.every(isShipbuildingStrategicProcurementDemand)
  );
}

export function isShipbuildingProcurementStatusRequest(value: unknown): value is ShipbuildingProcurementStatusRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ShipbuildingProcurementStatusRequest>;
  return (
    typeof request.stateId === "number" &&
    Number.isInteger(request.stateId) &&
    request.stateId > 0 &&
    typeof request.destinationMarketId === "number" &&
    Number.isInteger(request.destinationMarketId) &&
    request.destinationMarketId > 0
  );
}
