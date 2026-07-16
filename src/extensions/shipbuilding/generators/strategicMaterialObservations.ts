import {
  SHIPBUILDING_MATERIAL_IDS,
  type ShipbuildingMaterialId,
  type ShipbuildingProcurementStatus
} from "../../hostTypes";
import { getAnnualShipbuildingMaterialDemand, type ShipClass } from "./shipClasses";

/** One year's reserve avoids treating a single successful construction batch as supply security. */
export const STRATEGIC_MATERIAL_TARGET_RESERVE_DAYS = 365;

export interface ShipyardMaterialObservation {
  material: ShipbuildingMaterialId;
  /** `null` means Economy has not made this Good available at the destination market. */
  stock: number | null;
  annualDemand: number;
  targetReserve: number;
  /** Phase 9.2 will replace this zero with assigned strategic-procurement cargo. */
  inTransit: number;
  /** Phase 9.2 will set this from the assigned source market's state. */
  sourceStateId: number | null;
}

type MarketGoods = Readonly<Record<number, Readonly<{ stock: number }> | undefined>>;
type MaterialGood = Readonly<{ i: number; name: string }>;

/**
 * Builds the M9.0 observation model without importing Economy. Shipbuilding only
 * reads the host world snapshot; Economy remains the owner of stock and, later,
 * procurement orders and caravans.
 */
export function getShipyardMaterialObservations(
  shipClass: ShipClass,
  goods: readonly MaterialGood[],
  marketGoods: MarketGoods | undefined,
  procurementStatuses: readonly ShipbuildingProcurementStatus[] = []
): ShipyardMaterialObservation[] {
  const annualDemand = getAnnualShipbuildingMaterialDemand(shipClass);
  const goodIdByName = new Map(goods.map(good => [good.name, good.i]));
  const reserveFactor = STRATEGIC_MATERIAL_TARGET_RESERVE_DAYS / 365;

  return SHIPBUILDING_MATERIAL_IDS.map(material => {
    const goodId = goodIdByName.get(material);
    const stock = goodId === undefined ? null : (marketGoods?.[goodId]?.stock ?? 0);
    const yearlyAmount = annualDemand[material];

    const procurementStatus = procurementStatuses.find(status => status.material === material);
    return {
      material,
      stock,
      annualDemand: yearlyAmount,
      targetReserve: yearlyAmount * reserveFactor,
      inTransit: procurementStatus?.inTransit ?? 0,
      sourceStateId: procurementStatus?.sourceStateId ?? null
    };
  });
}
