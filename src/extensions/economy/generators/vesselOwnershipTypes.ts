export type VesselEconomicOwnerKind = "market" | "merchantOrganization" | "merchant";

/**
 * Economic ownership of a Shipbuilding-owned merchant hull. Shipbuilding remains authoritative
 * for the hull's physical lifecycle and its operating market.
 */
export interface MerchantVesselOwnership {
  shipHullId: number;
  ownerKind: VesselEconomicOwnerKind;
  ownerId: number;
}
