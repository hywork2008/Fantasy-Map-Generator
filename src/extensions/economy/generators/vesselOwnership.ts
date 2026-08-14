import {
  getBurgMarketLedgers,
  getMarkets,
  getMerchantOrganizations,
  getMerchantVesselOwnerships,
  setMerchantVesselOwnerships
} from "../economyContext";
import type { MerchantVesselOwnership } from "./vesselOwnershipTypes";

export function recordMerchantHullOwnership(shipHullId: number, burgId: number): void {
  const ownerships = getMerchantVesselOwnerships();
  if (ownerships.some(ownership => ownership.shipHullId === shipHullId)) return;

  const market = getMarkets().find(candidate => candidate.centerBurgId === burgId);
  const organization = market
    ? getMerchantOrganizations().find(candidate => candidate.homeMarketId === market.i)
    : undefined;
  const dominantMerchant = getBurgMarketLedgers()
    .find(ledger => ledger.burgId === burgId)
    ?.merchants.toSorted((left, right) => right.share - left.share)[0];
  const ownership: MerchantVesselOwnership = organization
    ? { shipHullId, ownerKind: "merchantOrganization", ownerId: organization.i }
    : dominantMerchant
      ? { shipHullId, ownerKind: "merchant", ownerId: dominantMerchant.characterId }
      : { shipHullId, ownerKind: "market", ownerId: market?.i ?? burgId };
  setMerchantVesselOwnerships([...ownerships, ownership]);
}

export function clearMerchantHullOwnerships(): void {
  setMerchantVesselOwnerships([]);
}
