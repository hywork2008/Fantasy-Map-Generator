import { SHIP_CLASS_DEFINITIONS, type ShipbuildingMerchantHullSnapshot } from "../../hostTypes";
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
  MerchantWaterAssetReference,
  TradeRouteSegment,
  TransportAllocation,
  TransportReservation
} from "./marketTypes";
import { getLandTransportDefinition } from "./tradeCargo";

const MAINTENANCE_RECOVERY_DAYS = 30;

export type MerchantTransportAssetAvailability = {
  assetId: string;
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

function getShipDefinition(shipClassId: string) {
  return SHIP_CLASS_DEFINITIONS.find(shipClass => shipClass.id === shipClassId);
}

function getWaterAssetAvailability(asset: MerchantWaterAssetReference): MerchantTransportAssetAvailability {
  const definition = getShipDefinition(asset.shipClassId);
  return {
    assetId: `hull-${asset.shipHullId}`,
    assetName: `${definition?.name ?? asset.shipClassId} #${asset.shipHullId}`,
    cargoCapacitySlots: definition?.cargoCapacitySlots ?? 0,
    available: asset.state === "available" ? 1 : 0,
    reserved: asset.state === "reserved" ? 1 : 0,
    inTransit: asset.state === "inTransit" ? 1 : 0,
    maintenance: asset.state === "maintenance" ? 1 : 0,
    total: 1
  };
}

function assertBalance(balance: MerchantLandAssetBalance): void {
  if ([balance.available, balance.reserved, balance.inTransit, balance.maintenance].some(value => value < 0)) {
    throw new Error(`[economy] Invalid merchant transport balance for ${balance.assetId}`);
  }
}

function hasLandAllocation(allocations: readonly TransportAllocation[]): boolean {
  return allocations.some(allocation => allocation.mode === "land" && allocation.unitCount > 0);
}

function hasWaterAllocation(allocations: readonly TransportAllocation[]): boolean {
  return allocations.some(allocation => allocation.mode === "water" && allocation.usedSlots > 0);
}

function takeWaterConvoy<T extends { definition: { cargoCapacitySlots: number } }>(
  available: readonly T[],
  neededSlots: number
): T[] {
  const selected: T[] = [];
  let capacity = 0;
  for (const entry of [...available].sort(
    (left, right) => right.definition.cargoCapacitySlots - left.definition.cargoCapacitySlots
  )) {
    selected.push(entry);
    capacity += entry.definition.cargoCapacitySlots;
    if (capacity >= neededSlots) return selected;
  }
  return [];
}

/**
 * Owns all mutation rules for durable market transport assets. Caravans only receive a
 * reservation id, so callers cannot accidentally duplicate an asset between shipments.
 */
export class MerchantTransportAssetsModule {
  /** True only while Shipbuilding has published a current merchant-hull snapshot. */
  private waterAssetModeActive = false;

  ensureLedger(marketId: number): MerchantTransportLedger | null {
    if (!getMarketById(marketId)) return null;
    const existing = findLedger(marketId);
    if (existing) {
      existing.organizationId = getOrganizationId(marketId);
      existing.waterAssets ??= [];
      return existing;
    }

    const ledger: MerchantTransportLedger = {
      marketId,
      organizationId: getOrganizationId(marketId),
      landAssets: createLandAssets(marketId),
      waterAssets: [],
      lastReconciledTick: 0
    };
    const ledgers = getMerchantTransportLedgers();
    ledgers.push(ledger);
    setMerchantTransportLedgers(ledgers);
    return ledger;
  }

  /** Reconciles Economy references without duplicating Shipbuilding's individual hull records. */
  reconcileMerchantHulls(hulls: readonly ShipbuildingMerchantHullSnapshot[]): void {
    this.waterAssetModeActive = true;
    const burgs = getWorldContext().pack.burgs ?? [];
    const hullIdsByMarket = new Map<number, Set<number>>();

    for (const hull of hulls) {
      const marketId = burgs[hull.homeBurgId]?.market;
      if (typeof marketId !== "number" || !getMarketById(marketId)) continue;
      const ledger = this.ensureLedger(marketId);
      if (!ledger) continue;
      const existing = ledger.waterAssets.find(asset => asset.shipHullId === hull.id);
      const state =
        existing?.reservationId !== undefined
          ? existing.state
          : hull.status === "maintenance"
            ? "maintenance"
            : hull.status === "cargo"
              ? "inTransit"
              : "available";
      const next: MerchantWaterAssetReference = {
        shipHullId: hull.id,
        shipClassId: hull.shipClassId,
        homeBurgId: hull.homeBurgId,
        state,
        ...(existing?.reservationId === undefined ? {} : { reservationId: existing.reservationId })
      };
      if (existing) Object.assign(existing, next);
      else ledger.waterAssets.push(next);

      let ids = hullIdsByMarket.get(marketId);
      if (!ids) {
        ids = new Set();
        hullIdsByMarket.set(marketId, ids);
      }
      ids.add(hull.id);
    }

    for (const ledger of getMerchantTransportLedgers()) {
      const currentIds = hullIdsByMarket.get(ledger.marketId) ?? new Set<number>();
      ledger.waterAssets ??= [];
      ledger.waterAssets = ledger.waterAssets.filter(asset => currentIds.has(asset.shipHullId));
    }
  }

  setWaterAssetModeActive(active: boolean): void {
    this.waterAssetModeActive = active;
  }

  requestMerchantHullSnapshot(): void {
    const detail = { source: "economy" as const, handled: false };
    document.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hulls-request", { detail }));
    if (!detail.handled) this.waterAssetModeActive = false;
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
    if (!hasLandAllocation(allocations) && !hasWaterAllocation(allocations)) return null;
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

    const waterAllocations = this.allocateWaterAssets(ledger, allocations);
    if (hasWaterAllocation(allocations) && this.waterAssetModeActive && !waterAllocations) return null;
    const resolvedAllocations = waterAllocations
      ? [...allocations.filter(allocation => allocation.mode !== "water"), ...waterAllocations]
      : allocations.map(allocation => ({ ...allocation }));
    const hullIds = resolvedAllocations.flatMap(allocation => allocation.shipHullIds ?? []);
    if (hullIds.length && !this.reserveShipbuildingHulls(hullIds)) return null;

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
      allocations: resolvedAllocations.map(allocation => ({ ...allocation })),
      state: "reserved"
    };
    const reservations = getTransportReservations();
    reservations.push(reservation);
    for (const hullId of hullIds) {
      const asset = ledger.waterAssets.find(item => item.shipHullId === hullId);
      if (!asset) continue;
      asset.state = "reserved";
      asset.reservationId = reservation.id;
    }
    setTransportReservations(reservations);
    setNextTransportReservationId(nextId + 1);
    return { reservation, dispatcherMarketId };
  }

  private allocateWaterAssets(
    ledger: MerchantTransportLedger,
    allocations: readonly TransportAllocation[]
  ): TransportAllocation[] | null {
    const requested = allocations.filter(allocation => allocation.mode === "water" && allocation.usedSlots > 0);
    if (!requested.length) return [];
    if (!this.waterAssetModeActive) return null;

    const available = ledger.waterAssets
      .filter(asset => asset.state === "available")
      .map(asset => ({ asset, definition: getShipDefinition(asset.shipClassId) }))
      .filter(
        (
          entry
        ): entry is {
          asset: MerchantWaterAssetReference;
          definition: NonNullable<ReturnType<typeof getShipDefinition>>;
        } => Boolean(entry.definition)
      );
    const resolved: TransportAllocation[] = [];

    for (const allocation of requested) {
      const neededSlots = allocation.usedSlots;
      const single = available
        .filter(entry => entry.definition.cargoCapacitySlots >= neededSlots)
        .sort((left, right) => left.definition.cargoCapacitySlots - right.definition.cargoCapacitySlots)[0];
      const selected = single ? [single] : takeWaterConvoy(available, neededSlots);
      if (!selected.length) return null;

      let remainingSlots = neededSlots;
      for (const entry of selected) {
        const index = available.indexOf(entry);
        if (index >= 0) available.splice(index, 1);
        const capacitySlots = entry.definition.cargoCapacitySlots;
        const usedSlots = Math.min(capacitySlots, remainingSlots);
        remainingSlots -= usedSlots;
        resolved.push({
          mode: "water",
          transportId: entry.definition.id,
          transportName: entry.definition.name,
          unitCount: 1,
          capacitySlots,
          usedSlots,
          shipHullIds: [entry.asset.shipHullId]
        });
      }
    }
    return resolved;
  }

  private reserveShipbuildingHulls(hullIds: readonly number[]): boolean {
    const detail = { hullIds, result: undefined as "fulfilled" | "unavailable" | undefined };
    document.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hull-reservation-request", { detail }));
    return detail.result === "fulfilled";
  }

  private releaseShipbuildingHulls(hullIds: readonly number[], outcome: "arrived" | "lost"): void {
    if (!hullIds.length) return;
    const detail = { hullIds, outcome, result: undefined as "fulfilled" | "unavailable" | undefined };
    document.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hull-release-request", { detail }));
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
    for (const hullId of reservation.allocations.flatMap(allocation => allocation.shipHullIds ?? [])) {
      const asset = ledger.waterAssets.find(item => item.shipHullId === hullId);
      if (!asset) continue;
      asset.state = "inTransit";
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
    const hullIds = reservation.allocations.flatMap(allocation => allocation.shipHullIds ?? []);
    for (const hullId of hullIds) {
      const asset = ledger.waterAssets.find(item => item.shipHullId === hullId);
      if (!asset) continue;
      asset.state = "available";
      asset.reservationId = undefined;
    }
    this.releaseShipbuildingHulls(hullIds, "arrived");
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
    const hullIds = reservation.allocations.flatMap(allocation => allocation.shipHullIds ?? []);
    for (const hullId of hullIds) {
      const asset = ledger.waterAssets.find(item => item.shipHullId === hullId);
      if (!asset) continue;
      asset.state = outcome === "arrived" ? "available" : "maintenance";
      asset.reservationId = undefined;
    }
    this.releaseShipbuildingHulls(hullIds, outcome);
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
    const landAssets = ledger.landAssets.map(asset => {
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
    return [...landAssets, ...ledger.waterAssets.map(getWaterAssetAvailability)];
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

  /** The largest shipment that can be assigned without bypassing a physical mode's capacity. */
  getLargestAvailableRouteCapacity(
    marketId: number,
    routeSegments: readonly TradeRouteSegment[],
    draftAnimalId: string
  ): number {
    const modes = new Set(routeSegments.map(segment => segment.type));
    const capacities: number[] = [];
    if (modes.has("land")) capacities.push(this.getLargestAvailableLandCapacity(marketId, draftAnimalId));
    if (modes.has("water") && this.waterAssetModeActive) {
      capacities.push(
        this.getAvailability(marketId)
          .filter(asset => asset.assetId.startsWith("hull-") && asset.available > 0)
          .reduce((largest, asset) => Math.max(largest, asset.cargoCapacitySlots), 0)
      );
    }
    return capacities.length ? Math.min(...capacities) : Number.POSITIVE_INFINITY;
  }

  getReservation(reservationId: number | undefined): TransportReservation | undefined {
    return reservationId === undefined ? undefined : getTransportReservations().find(item => item.id === reservationId);
  }

  /** Credits completed land assets directly to the durable ledger, bypassing saleable market stock. */
  addAvailableLandAssets(marketId: number, assetId: MerchantLandAssetBalance["assetId"], quantity: number): void {
    if (!(quantity > 0)) return;
    const ledger = this.ensureLedger(marketId);
    const balance = ledger?.landAssets.find(asset => asset.assetId === assetId);
    if (!balance) return;
    balance.available += quantity;
    assertBalance(balance);
  }

  clear(): void {
    this.waterAssetModeActive = false;
    setMerchantTransportLedgers([]);
    setTransportReservations([]);
    setNextTransportReservationId(0);
  }
}

export const MerchantTransportAssets = new MerchantTransportAssetsModule();
