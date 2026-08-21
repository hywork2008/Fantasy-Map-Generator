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

export type ShipbuildingOwner = "state" | "market" | "shipyard";

/**
 * Read-only projection of a merchant-owned hull. Shipbuilding owns the hull record;
 * Economy only retains the id while assigning trade cargo.
 */
export interface ShipbuildingMerchantHullSnapshot {
  id: number;
  shipClassId: string;
  homeBurgId: number;
  ownerId: number;
  status: "docked" | "voyage" | "cargo" | "maintenance";
  /** Optional itinerary fields (P1); older snapshots omit them. */
  currentBurgId?: number | null;
  nextBurgId?: number | null;
  caravanId?: number | null;
  routeProgress?: number;
  duty?: "idle" | "loading" | "cargo" | "ballast" | "patrol";
}

/** Economy requests a fresh snapshot without importing Shipbuilding internals. */
export interface ShipbuildingMerchantHullsRequest {
  source: "economy";
  handled?: boolean;
}

/** Published after a snapshot request and whenever a merchant hull changes. */
export interface ShipbuildingMerchantHullsSnapshot {
  hulls: readonly ShipbuildingMerchantHullSnapshot[];
}

/** Mutable synchronous request to take one or more hulls out of Shipbuilding voyages. */
export interface ShipbuildingMerchantHullReservationRequest {
  hullIds: readonly number[];
  /** Economy Caravan binding this reservation (set when known). */
  caravanId?: number;
  /** Origin port burg for the cargo leg. */
  originBurgId?: number | null;
  /** Destination port burg for the cargo leg. */
  destinationBurgId?: number | null;
  result?: "fulfilled" | "unavailable";
}

/** Mutable synchronous request to return merchant hulls to their Shipbuilding lifecycle. */
export interface ShipbuildingMerchantHullReleaseRequest {
  hullIds: readonly number[];
  outcome: "arrived" | "lost";
  /** Arrival port when outcome is "arrived"; used to berth idle hulls. */
  destinationBurgId?: number | null;
  result?: "fulfilled" | "unavailable";
}

/** Economy asks which state-navy hulls can leave their patrol for an overseas escort. */
export interface ShipbuildingStateHullAvailabilityRequest {
  source: "economy";
  stateId: number;
  hullIds?: number[];
}

/** Mutable synchronous request to assign state-owned hulls to an overseas expedition. */
export interface ShipbuildingStateHullReservationRequest {
  stateId: number;
  expeditionId: number;
  hullIds: readonly number[];
  result?: "fulfilled" | "unavailable";
}

/** Mutable synchronous request to return state-owned overseas escorts to their navy lifecycle. */
export interface ShipbuildingStateHullReleaseRequest {
  expeditionId: number;
  hullIds: readonly number[];
  outcome: "arrived" | "lost";
  result?: "fulfilled" | "unavailable";
}

/** Economy projects live caravan progress onto reserved merchant hulls each tick. */
export interface EconomyCaravanHullPositionUpdate {
  hullId: number;
  caravanId: number;
  originBurgId: number | null;
  destinationBurgId: number | null;
  /** 0..1 progress along the caravan route. */
  progress: number;
  phase: "transit" | "loading";
}

export interface EconomyCaravanHullPositionsDetail {
  updates: readonly EconomyCaravanHullPositionUpdate[];
}
export const SHIP_GOOD_NAMES = ["Sloop", "Caravel", "Galleon"] as const;
export type ShipGoodName = (typeof SHIP_GOOD_NAMES)[number];
export type ShipGoodStock = Readonly<Record<ShipGoodName, number>>;

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
  owner: ShipbuildingOwner;
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
    (request.owner !== "state" && request.owner !== "market" && request.owner !== "shipyard") ||
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

export function isShipbuildingMerchantHullsRequest(value: unknown): value is ShipbuildingMerchantHullsRequest {
  return Boolean(
    value && typeof value === "object" && (value as Partial<ShipbuildingMerchantHullsRequest>).source === "economy"
  );
}

export function isShipbuildingMerchantHullsSnapshot(value: unknown): value is ShipbuildingMerchantHullsSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ShipbuildingMerchantHullsSnapshot>;
  return (
    Array.isArray(snapshot.hulls) &&
    snapshot.hulls.every(hull => {
      if (!hull || typeof hull !== "object") return false;
      const candidate = hull as Partial<ShipbuildingMerchantHullSnapshot>;
      return (
        Number.isInteger(candidate.id) &&
        typeof candidate.shipClassId === "string" &&
        Number.isInteger(candidate.homeBurgId) &&
        Number.isInteger(candidate.ownerId) &&
        (candidate.status === "docked" ||
          candidate.status === "voyage" ||
          candidate.status === "cargo" ||
          candidate.status === "maintenance")
      );
    })
  );
}

export function isShipbuildingMerchantHullReservationRequest(
  value: unknown
): value is ShipbuildingMerchantHullReservationRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ShipbuildingMerchantHullReservationRequest>;
  return Array.isArray(request.hullIds) && request.hullIds.every(id => Number.isInteger(id) && id > 0);
}

export function isShipbuildingMerchantHullReleaseRequest(
  value: unknown
): value is ShipbuildingMerchantHullReleaseRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ShipbuildingMerchantHullReleaseRequest>;
  return (
    Array.isArray(request.hullIds) &&
    request.hullIds.every(id => Number.isInteger(id) && id > 0) &&
    (request.outcome === "arrived" || request.outcome === "lost")
  );
}

export function isShipbuildingStateHullAvailabilityRequest(
  value: unknown
): value is ShipbuildingStateHullAvailabilityRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ShipbuildingStateHullAvailabilityRequest>;
  return (
    request.source === "economy" &&
    typeof request.stateId === "number" &&
    Number.isInteger(request.stateId) &&
    request.stateId > 0
  );
}

export function isShipbuildingStateHullReservationRequest(
  value: unknown
): value is ShipbuildingStateHullReservationRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ShipbuildingStateHullReservationRequest>;
  return (
    typeof request.stateId === "number" &&
    Number.isInteger(request.stateId) &&
    request.stateId > 0 &&
    typeof request.expeditionId === "number" &&
    Number.isInteger(request.expeditionId) &&
    request.expeditionId > 0 &&
    Array.isArray(request.hullIds) &&
    request.hullIds.every(id => Number.isInteger(id) && id > 0)
  );
}

export function isShipbuildingStateHullReleaseRequest(value: unknown): value is ShipbuildingStateHullReleaseRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ShipbuildingStateHullReleaseRequest>;
  return (
    typeof request.expeditionId === "number" &&
    Number.isInteger(request.expeditionId) &&
    request.expeditionId > 0 &&
    Array.isArray(request.hullIds) &&
    request.hullIds.every(id => Number.isInteger(id) && id > 0) &&
    (request.outcome === "arrived" || request.outcome === "lost")
  );
}

/** Synchronous Economy query used only to choose a market shipyard's next surplus hull. */
export interface ShipbuildingShipGoodStockRequest {
  marketId: number;
  result?: ShipGoodStock;
}

/** Completion signal for a generic market ship built from otherwise idle shipyard capacity. */
export interface ShipbuildingSurplusShipRequest {
  burgId: number;
  marketId: number;
  shipClassId: string;
  result?: "fulfilled" | "noMarket" | "missingGood";
}

export function isShipbuildingShipGoodStockRequest(value: unknown): value is ShipbuildingShipGoodStockRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ShipbuildingShipGoodStockRequest>;
  return typeof request.marketId === "number" && Number.isInteger(request.marketId) && request.marketId > 0;
}

export function isShipbuildingSurplusShipRequest(value: unknown): value is ShipbuildingSurplusShipRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ShipbuildingSurplusShipRequest>;
  return (
    typeof request.burgId === "number" &&
    Number.isInteger(request.burgId) &&
    request.burgId > 0 &&
    typeof request.marketId === "number" &&
    Number.isInteger(request.marketId) &&
    request.marketId > 0 &&
    typeof request.shipClassId === "string"
  );
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
