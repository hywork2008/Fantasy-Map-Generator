import { SHIP_CLASS_DEFINITIONS, type ShipbuildingMerchantHullSnapshot } from "../../hostTypes";
import {
  getExportStagingLots,
  getFlowCycleHistory,
  getGoods,
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
import { DEMAND_PRIORITY, DEMAND_TARGET_FACTORS, type DemandCategory, Goods, isGoodEnabled } from "./goods-generator";
import type { Good } from "./goodsGeneratorTypes";
import {
  estimateSoftAnnualExportCargoSlots,
  getDefaultMonthsOfCover,
  type LandFleetSeedCounts,
  landFleetCountsFromBurgScale,
  mergeLandFleetCounts,
  sizeLandFleetFromAnnualExportSlots
} from "./marketFlowBudget";
import { buildFlowReportSummary } from "./marketFlowReport";
import type {
  Caravan,
  MerchantLandAssetBalance,
  MerchantRiverAssetBalance,
  MerchantTransportLedger,
  MerchantWaterAssetReference,
  TradeRouteSegment,
  TransportAllocation,
  TransportReservation
} from "./marketTypes";
import { getGoodCargoSlotsPerUnit, getLandTransportDefinition, RIVER_BARGE_TRANSPORT } from "./tradeCargo";

const MAINTENANCE_RECOVERY_DAYS = 30;
/** Top-up fleets from measured A0 flow only after this many production cycles. */
const FLOW_FLEET_TOPUP_MIN_CYCLES = 3;
export const RIVER_BARGE_CARGO_CAPACITY_SLOTS = RIVER_BARGE_TRANSPORT.cargoCapacitySlots;

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

function isTradeableGood(good: Good): boolean {
  if (!isGoodEnabled(good)) return false;
  if (good.tags.includes("stapleFood")) return false;
  return Boolean(good.distribution || good.recipes?.length);
}

function collectConsumerDemandFactors(goods: readonly Good[]): number[] {
  const totalCoverageByCategory = Object.fromEntries(
    DEMAND_PRIORITY.map(category => [
      category,
      goods.reduce((sum, good) => sum + (good.demandCoverage?.[category] || 0), 0) || 1
    ])
  ) as Record<DemandCategory, number>;

  const demandFactor: number[] = [];
  for (const good of goods) {
    demandFactor[good.i] = DEMAND_PRIORITY.reduce((sum, category) => {
      const share = (good.demandCoverage?.[category] || 0) / (totalCoverageByCategory[category] || 1);
      return sum + share * DEMAND_TARGET_FACTORS[category];
    }, 0);
  }
  return demandFactor;
}

function collectIndustrialDemandFactors(goods: readonly Good[], consumerDemandFactors: number[]): number[] {
  const demandFactor: number[] = [];
  for (const good of goods) {
    if (!good.recipes?.length) continue;
    const outputDemand = consumerDemandFactors[good.i] || 0;
    for (const recipe of good.recipes) {
      for (const [ingredientIdStr, amount] of Object.entries(recipe)) {
        const ingredientId = Number(ingredientIdStr);
        const ingredient = Goods.get(ingredientId);
        if (!ingredient || !isGoodEnabled(ingredient)) continue;
        demandFactor[ingredientId] = (demandFactor[ingredientId] || 0) + amount * outputDemand;
      }
    }
  }
  return demandFactor;
}

function marketPopulation(marketId: number): number {
  let population = 0;
  for (const burg of getWorldContext().pack.burgs ?? []) {
    if (!burg.i || burg.removed || burg.market !== marketId || !burg.population) continue;
    population += burg.population;
  }
  return population;
}

function stagingUnitsByGood(marketId: number): Map<number, number> {
  const byGood = new Map<number, number>();
  for (const lot of getExportStagingLots()) {
    if (lot.marketId !== marketId || lot.units <= 0) continue;
    byGood.set(lot.goodId, (byGood.get(lot.goodId) || 0) + lot.units);
  }
  return byGood;
}

/**
 * Prefer multi-cycle A0 measured export slots when available; otherwise soft budget from
 * retail stock + export staging (so booked-but-not-yet-sailed cargo still sizes the fleet).
 */
export function estimateMarketAnnualExportCargoSlots(marketId: number): number {
  const history = getFlowCycleHistory();
  if (history.length >= FLOW_FLEET_TOPUP_MIN_CYCLES) {
    const summary = buildFlowReportSummary(history);
    const measured = summary.rows
      .filter(row => row.marketId === marketId)
      .reduce((sum, row) => sum + row.exportSlots, 0);
    if (measured > 0) return measured;
  }

  const market = getMarketById(marketId);
  if (!market) return 0;

  const goods = getGoods().filter(isTradeableGood);
  if (!goods.length) return 0;

  const consumer = collectConsumerDemandFactors(goods);
  const industrial = collectIndustrialDemandFactors(goods, consumer);
  const population = marketPopulation(marketId);
  const staging = stagingUnitsByGood(marketId);

  const rows = goods.map(good => {
    const retail = market.goods[good.i]?.stock ?? 0;
    const staged = staging.get(good.i) || 0;
    return {
      stock: retail + staged,
      cycleDemand: population * ((consumer[good.i] || 0) + (industrial[good.i] || 0)),
      cargoSlotsPerUnit: getGoodCargoSlotsPerUnit(good),
      monthsOfCover: getDefaultMonthsOfCover(good)
    };
  });

  return estimateSoftAnnualExportCargoSlots(rows);
}

/** Land fleet counts: max(burg floor, export-slot seed). */
export function computeLandFleetSeedCounts(marketId: number): LandFleetSeedCounts {
  const burgs = getWorldContext().pack.burgs ?? [];
  const burgCount = burgs.filter(burg => !burg.removed && burg.market === marketId).length;
  const burgFloor = landFleetCountsFromBurgScale(burgCount);
  const annualSlots = estimateMarketAnnualExportCargoSlots(marketId);
  const fromExport = sizeLandFleetFromAnnualExportSlots({ annualExportCargoSlots: annualSlots });
  return mergeLandFleetCounts(burgFloor, fromExport);
}

function makeLandBalance(assetId: MerchantLandAssetBalance["assetId"], count: number): MerchantLandAssetBalance {
  return {
    assetId,
    available: Math.max(0, count),
    reserved: 0,
    inTransit: 0,
    maintenance: 0,
    recoveryDays: 0
  };
}

function createLandAssets(marketId: number): MerchantLandAssetBalance[] {
  const counts = computeLandFleetSeedCounts(marketId);
  return [
    makeLandBalance("pack-train", counts.packTrain),
    makeLandBalance("cart", counts.cart),
    makeLandBalance("wagon", counts.wagon)
  ];
}

function landAssetTotal(balance: MerchantLandAssetBalance): number {
  return balance.available + balance.reserved + balance.inTransit + balance.maintenance;
}

/**
 * Grow land fleets toward export-slot needs without shrinking or touching reserved/in-transit units.
 * Called after flow diagnostics accumulate so early soft-budget seeds can catch up.
 */
function topUpLandAssets(ledger: MerchantTransportLedger): void {
  const desired = computeLandFleetSeedCounts(ledger.marketId);
  const targets: { assetId: MerchantLandAssetBalance["assetId"]; count: number }[] = [
    { assetId: "pack-train", count: desired.packTrain },
    { assetId: "cart", count: desired.cart },
    { assetId: "wagon", count: desired.wagon }
  ];

  for (const target of targets) {
    let balance = ledger.landAssets.find(asset => asset.assetId === target.assetId);
    if (!balance) {
      balance = makeLandBalance(target.assetId, 0);
      ledger.landAssets.push(balance);
    }
    const total = landAssetTotal(balance);
    if (target.count > total) {
      balance.available += target.count - total;
      assertBalance(balance);
    }
  }
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

function assertBalance(balance: MerchantLandAssetBalance | MerchantRiverAssetBalance): void {
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

function hasRiverAllocation(allocations: readonly TransportAllocation[]): boolean {
  return allocations.some(allocation => allocation.mode === "river" && allocation.unitCount > 0);
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
      existing.riverAssets ??= [];
      return existing;
    }

    const ledger: MerchantTransportLedger = {
      marketId,
      organizationId: getOrganizationId(marketId),
      landAssets: createLandAssets(marketId),
      riverAssets: [],
      waterAssets: [],
      lastReconciledTick: 0
    };
    const ledgers = getMerchantTransportLedgers();
    ledgers.push(ledger);
    setMerchantTransportLedgers(ledgers);
    return ledger;
  }

  /**
   * After A0 flow cycles accumulate, grow each market's land fleet toward measured/soft
   * annual export slots. Never reduces assets or cancels reservations.
   */
  topUpFleetsFromExportDemand(): void {
    const history = getFlowCycleHistory();
    if (history.length < FLOW_FLEET_TOPUP_MIN_CYCLES) return;

    for (const ledger of getMerchantTransportLedgers()) {
      topUpLandAssets(ledger);
    }
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

  /** True while Shipbuilding has published a merchant-hull snapshot (finite sea fleet mode). */
  isWaterAssetModeActive(): boolean {
    return this.waterAssetModeActive;
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
    allocations: readonly TransportAllocation[],
    itinerary?: {
      originBurgId?: number | null;
      destinationBurgId?: number | null;
    }
  ): TransportReservationResult | null {
    if (!hasLandAllocation(allocations) && !hasWaterAllocation(allocations) && !hasRiverAllocation(allocations))
      return null;
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
    const riverAllocations = allocations.filter(
      (allocation): allocation is TransportAllocation & { mode: "river" } =>
        allocation.mode === "river" && allocation.unitCount > 0
    );
    const riverBalance = ledger.riverAssets.find(asset => asset.assetId === "river-barge");
    if (
      riverAllocations.some(allocation => allocation.transportId !== "river-barge") ||
      (riverAllocations.length &&
        (!riverBalance || riverBalance.available < riverAllocations.reduce((sum, item) => sum + item.unitCount, 0)))
    ) {
      return null;
    }

    const waterAllocations = this.allocateWaterAssets(ledger, allocations);
    if (hasWaterAllocation(allocations) && this.waterAssetModeActive && !waterAllocations) return null;
    const resolvedAllocations = waterAllocations
      ? [...allocations.filter(allocation => allocation.mode !== "water"), ...waterAllocations]
      : allocations.map(allocation => ({ ...allocation }));
    const hullIds = resolvedAllocations.flatMap(allocation => allocation.shipHullIds ?? []);
    if (
      hullIds.length &&
      !this.reserveShipbuildingHulls(hullIds, {
        caravanId,
        originBurgId: itinerary?.originBurgId,
        destinationBurgId: itinerary?.destinationBurgId
      })
    ) {
      return null;
    }

    for (const { balance, allocation } of balances) {
      if (!balance) continue;
      balance.available -= allocation.unitCount;
      balance.reserved += allocation.unitCount;
      assertBalance(balance);
    }
    for (const allocation of riverAllocations) {
      if (!riverBalance) continue;
      riverBalance.available -= allocation.unitCount;
      riverBalance.reserved += allocation.unitCount;
      assertBalance(riverBalance);
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

  private reserveShipbuildingHulls(
    hullIds: readonly number[],
    itinerary?: {
      caravanId?: number;
      originBurgId?: number | null;
      destinationBurgId?: number | null;
    }
  ): boolean {
    const detail = {
      hullIds,
      caravanId: itinerary?.caravanId,
      originBurgId: itinerary?.originBurgId,
      destinationBurgId: itinerary?.destinationBurgId,
      result: undefined as "fulfilled" | "unavailable" | undefined
    };
    document.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hull-reservation-request", { detail }));
    return detail.result === "fulfilled";
  }

  private releaseShipbuildingHulls(
    hullIds: readonly number[],
    outcome: "arrived" | "lost",
    destinationBurgId?: number | null
  ): void {
    if (!hullIds.length) return;
    const detail = {
      hullIds,
      outcome,
      destinationBurgId,
      result: undefined as "fulfilled" | "unavailable" | undefined
    };
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
    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "river") continue;
      const balance = ledger.riverAssets.find(asset => asset.assetId === allocation.transportId);
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
    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "river") continue;
      const balance = ledger.riverAssets.find(asset => asset.assetId === allocation.transportId);
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
    // Cancel returns the hull to its home port (no destination berth).
    this.releaseShipbuildingHulls(
      hullIds,
      "arrived",
      ledger.waterAssets.find(asset => hullIds.includes(asset.shipHullId))?.homeBurgId ?? null
    );
    reservation.state = "cancelled";
  }

  settleCaravan(
    caravan: Pick<Caravan, "transportReservationId"> & Partial<Pick<Caravan, "buyer" | "buyerType">>,
    outcome: "arrived" | "lost"
  ): void {
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
    const destinationMarketId =
      caravan.buyerType === "market" && typeof caravan.buyer === "number"
        ? caravan.buyer
        : caravan.buyerType === "burg" && typeof caravan.buyer === "number"
          ? getWorldContext().pack.burgs[caravan.buyer]?.market
          : undefined;
    const destinationLedger =
      typeof destinationMarketId === "number" ? (this.ensureLedger(destinationMarketId) ?? ledger) : ledger;
    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "river") continue;
      const sourceBalance = ledger.riverAssets.find(asset => asset.assetId === allocation.transportId);
      if (!sourceBalance) continue;
      sourceBalance.inTransit -= allocation.unitCount;
      let destinationBalance = destinationLedger.riverAssets.find(asset => asset.assetId === allocation.transportId);
      if (!destinationBalance) {
        destinationBalance = {
          assetId: "river-barge",
          available: 0,
          reserved: 0,
          inTransit: 0,
          maintenance: 0,
          recoveryDays: 0
        };
        destinationLedger.riverAssets.push(destinationBalance);
      }
      if (outcome === "arrived") destinationBalance.available += allocation.unitCount;
      else {
        destinationBalance.maintenance += allocation.unitCount;
        destinationBalance.recoveryDays = MAINTENANCE_RECOVERY_DAYS;
      }
      assertBalance(sourceBalance);
    }
    const hullIds = reservation.allocations.flatMap(allocation => allocation.shipHullIds ?? []);
    for (const hullId of hullIds) {
      const asset = ledger.waterAssets.find(item => item.shipHullId === hullId);
      if (!asset) continue;
      asset.state = outcome === "arrived" ? "available" : "maintenance";
      asset.reservationId = undefined;
    }
    const destinationBurgId =
      caravan.buyerType === "burg" && typeof caravan.buyer === "number"
        ? caravan.buyer
        : caravan.buyerType === "market" && typeof caravan.buyer === "number"
          ? (getMarketById(caravan.buyer)?.centerBurgId ?? null)
          : null;
    this.releaseShipbuildingHulls(hullIds, outcome, destinationBurgId);
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
      for (const balance of ledger.riverAssets) {
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
    const riverAssets = ledger.riverAssets.map(asset => ({
      assetId: asset.assetId,
      assetName: RIVER_BARGE_TRANSPORT.name,
      cargoCapacitySlots: RIVER_BARGE_CARGO_CAPACITY_SLOTS,
      available: asset.available,
      reserved: asset.reserved,
      inTransit: asset.inTransit,
      maintenance: asset.maintenance,
      total: asset.available + asset.reserved + asset.inTransit + asset.maintenance
    }));
    return [...landAssets, ...riverAssets, ...ledger.waterAssets.map(getWaterAssetAvailability)];
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
    if (modes.has("river")) {
      capacities.push(
        this.getAvailability(marketId)
          .filter(asset => asset.assetId === "river-barge" && asset.available > 0)
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

  /** Credits completed shallow-draft vessels to Economy's aggregate river-asset ledger. */
  addAvailableRiverAssets(marketId: number, quantity: number): void {
    if (!(quantity > 0)) return;
    const ledger = this.ensureLedger(marketId);
    if (!ledger) return;
    const balance = ledger.riverAssets.find(asset => asset.assetId === "river-barge");
    if (balance) balance.available += quantity;
    else {
      ledger.riverAssets.push({
        assetId: "river-barge",
        available: quantity,
        reserved: 0,
        inTransit: 0,
        maintenance: 0,
        recoveryDays: 0
      });
    }
  }

  clear(): void {
    this.waterAssetModeActive = false;
    setMerchantTransportLedgers([]);
    setTransportReservations([]);
    setNextTransportReservationId(0);
  }
}

export const MerchantTransportAssets = new MerchantTransportAssetsModule();
