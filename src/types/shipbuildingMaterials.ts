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
