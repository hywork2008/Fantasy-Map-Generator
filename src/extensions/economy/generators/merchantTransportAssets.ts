import {
  getMarketById,
  getMerchantOrganizations,
  getMerchantTransportLedgers,
  getNextTransportReservationId,
  getTransportReservations,
  getWorldContext,
  setMerchantTransportLedgers,
  setNextTransportReservationId,
  setTransportReservations
} from "../economyContext";
import { getDraftAnimalType } from "./caravanMovement";
import type {
  Caravan,
  MerchantLandAssetBalance,
  MerchantTransportLedger,
  TransportAllocation,
  TransportReservation
} from "./marketTypes";
import { getLandTransportDefinition } from "./tradeCargo";

const MAINTENANCE_RECOVERY_DAYS = 30;

export type MerchantTransportAssetAvailability = {
  assetId: MerchantLandAssetBalance["assetId"];
  assetName: string;
  cargoCapacitySlots: number;
  available: number;
  reserved: number;
  inTransit: number;
  maintenance: number;
  total: number;
};

export type TransportReservationResult = {
  reservation: TransportReservation;
  dispatcherMarketId: number;
};

function createLandAssets(marketId: number): MerchantLandAssetBalance[] {
  const burgs = getWorldContext().pack.burgs ?? [];
  const burgCount = burgs.filter(burg => !burg.removed && burg.market === marketId).length;
  const scale = Math.max(1, burgCount);
  const make = (assetId: MerchantLandAssetBalance["assetId"], count: number): MerchantLandAssetBalance => ({
    assetId,
    available: count,
    reserved: 0,
    inTransit: 0,
    maintenance: 0,
    recoveryDays: 0
  });

  return [
    make("pack-train", Math.max(1, Math.ceil(scale / 3))),
    make("cart", Math.max(1, Math.ceil(scale / 2))),
    make("wagon", Math.max(1, Math.floor(scale / 4)))
  ];
}

function getOrganizationId(marketId: number): number | undefined {
  return getMerchantOrganizations().find(organization => organization.homeMarketId === marketId)?.i;
}

function findLedger(marketId: number): MerchantTransportLedger | undefined {
  return getMerchantTransportLedgers().find(ledger => ledger.marketId === marketId);
}

function assertBalance(balance: MerchantLandAssetBalance): void {
  if ([balance.available, balance.reserved, balance.inTransit, balance.maintenance].some(value => value < 0)) {
    throw new Error(`[economy] Invalid merchant transport balance for ${balance.assetId}`);
  }
}

function hasLandAllocation(allocations: readonly TransportAllocation[]): boolean {
  return allocations.some(allocation => allocation.mode === "land" && allocation.unitCount > 0);
}

/**
 * Owns all mutation rules for durable market transport assets. Caravans only receive a
 * reservation id, so callers cannot accidentally duplicate an asset between shipments.
 */
export class MerchantTransportAssetsModule {
  ensureLedger(marketId: number): MerchantTransportLedger | null {
    if (!getMarketById(marketId)) return null;
    const existing = findLedger(marketId);
    if (existing) {
      existing.organizationId = getOrganizationId(marketId);
      return existing;
    }

    const ledger: MerchantTransportLedger = {
      marketId,
      organizationId: getOrganizationId(marketId),
      landAssets: createLandAssets(marketId),
      lastReconciledTick: 0
    };
    const ledgers = getMerchantTransportLedgers();
    ledgers.push(ledger);
    setMerchantTransportLedgers(ledgers);
    return ledger;
  }

  getDispatcherMarketId(caravan: Pick<Caravan, "seller" | "sellerType">): number | null {
    if (caravan.sellerType === "market") return getMarketById(caravan.seller) ? caravan.seller : null;
    const burg = getWorldContext().pack.burgs?.[caravan.seller];
    const marketId = burg?.market;
    return typeof marketId === "number" && getMarketById(marketId) ? marketId : null;
  }

  reserve(
    dispatcherMarketId: number,
    caravanId: number,
    allocations: readonly TransportAllocation[]
  ): TransportReservationResult | null {
    if (!hasLandAllocation(allocations)) return null;
    const ledger = this.ensureLedger(dispatcherMarketId);
    if (!ledger) return null;

    const requestedLandAllocations = allocations.filter(
      (allocation): allocation is TransportAllocation & { mode: "land" } =>
        allocation.mode === "land" && allocation.unitCount > 0
    );
    const balances = requestedLandAllocations.map(allocation => ({
      allocation,
      balance: ledger.landAssets.find(asset => asset.assetId === allocation.transportId)
    }));
    if (balances.some(({ balance, allocation }) => !balance || balance.available < allocation.unitCount)) return null;

    for (const { balance, allocation } of balances) {
      if (!balance) continue;
      balance.available -= allocation.unitCount;
      balance.reserved += allocation.unitCount;
      assertBalance(balance);
    }

    const nextId = getNextTransportReservationId();
    const reservation: TransportReservation = {
      id: nextId,
      dispatcherMarketId,
      caravanId,
      allocations: allocations.map(allocation => ({ ...allocation })),
      state: "reserved"
    };
    const reservations = getTransportReservations();
    reservations.push(reservation);
    setTransportReservations(reservations);
    setNextTransportReservationId(nextId + 1);
    return { reservation, dispatcherMarketId };
  }

  depart(reservationId: number): void {
    const reservation = getTransportReservations().find(item => item.id === reservationId);
    if (reservation?.state !== "reserved") return;
    const ledger = findLedger(reservation.dispatcherMarketId);
    if (!ledger) return;

    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "land") continue;
      const balance = ledger.landAssets.find(asset => asset.assetId === allocation.transportId);
      if (!balance) continue;
      balance.reserved -= allocation.unitCount;
      balance.inTransit += allocation.unitCount;
      assertBalance(balance);
    }
    reservation.state = "inTransit";
  }

  cancel(reservationId: number): void {
    const reservation = getTransportReservations().find(item => item.id === reservationId);
    if (reservation?.state !== "reserved") return;
    const ledger = findLedger(reservation.dispatcherMarketId);
    if (!ledger) return;

    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "land") continue;
      const balance = ledger.landAssets.find(asset => asset.assetId === allocation.transportId);
      if (!balance) continue;
      balance.reserved -= allocation.unitCount;
      balance.available += allocation.unitCount;
      assertBalance(balance);
    }
    reservation.state = "cancelled";
  }

  settleCaravan(caravan: Pick<Caravan, "transportReservationId">, outcome: "arrived" | "lost"): void {
    if (caravan.transportReservationId === undefined) return;
    const reservation = getTransportReservations().find(item => item.id === caravan.transportReservationId);
    if (reservation?.state !== "inTransit") return;
    const ledger = findLedger(reservation.dispatcherMarketId);
    if (!ledger) return;

    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "land") continue;
      const balance = ledger.landAssets.find(asset => asset.assetId === allocation.transportId);
      if (!balance) continue;
      balance.inTransit -= allocation.unitCount;
      if (outcome === "arrived") balance.available += allocation.unitCount;
      else {
        balance.maintenance += allocation.unitCount;
        balance.recoveryDays = MAINTENANCE_RECOVERY_DAYS;
      }
      assertBalance(balance);
    }
    reservation.state = outcome === "arrived" ? "released" : "lost";
  }

  recoverMaintenance(deltaDays: number): void {
    if (deltaDays <= 0) return;
    for (const ledger of getMerchantTransportLedgers()) {
      for (const balance of ledger.landAssets) {
        if (balance.maintenance <= 0 || balance.recoveryDays <= 0) continue;
        balance.recoveryDays = Math.max(0, balance.recoveryDays - deltaDays);
        if (balance.recoveryDays > 0) continue;
        balance.available += balance.maintenance;
        balance.maintenance = 0;
        assertBalance(balance);
      }
    }
  }

  getAvailability(marketId: number): MerchantTransportAssetAvailability[] {
    const ledger = this.ensureLedger(marketId);
    if (!ledger) return [];
    return ledger.landAssets.map(asset => {
      const definition = getLandTransportDefinition(asset.assetId);
      const total = asset.available + asset.reserved + asset.inTransit + asset.maintenance;
      return {
        assetId: asset.assetId,
        assetName: definition?.name ?? asset.assetId,
        cargoCapacitySlots: definition?.cargoCapacitySlots ?? 0,
        available: asset.available,
        reserved: asset.reserved,
        inTransit: asset.inTransit,
        maintenance: asset.maintenance,
        total
      };
    });
  }

  /** Largest single ready land vehicle for a route; callers use it to form a shippable partial manifest. */
  getLargestAvailableLandCapacity(marketId: number, draftAnimalId: string): number {
    const draftAnimal = getDraftAnimalType(draftAnimalId);
    return this.getAvailability(marketId).reduce((largest, asset) => {
      if (asset.available <= 0) return largest;
      const definition = getLandTransportDefinition(asset.assetId);
      if (!definition) return largest;
      const capacity = Math.min(
        definition.cargoCapacitySlots,
        definition.requiredDraftAnimals * draftAnimal.towCapacitySlots
      );
      return Math.max(largest, capacity);
    }, 0);
  }

  getReservation(reservationId: number | undefined): TransportReservation | undefined {
    return reservationId === undefined ? undefined : getTransportReservations().find(item => item.id === reservationId);
  }

  clear(): void {
    setMerchantTransportLedgers([]);
    setTransportReservations([]);
    setNextTransportReservationId(0);
  }
}

export const MerchantTransportAssets = new MerchantTransportAssetsModule();
