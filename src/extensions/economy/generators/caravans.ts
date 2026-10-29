import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { landTravelLegSpeeds } from "../../../services/routeGrade";
import { simEvents } from "../../../simulation/events";
import { normalizeHeightExponent } from "../../../utils/height";
import { optionsStore, type WorldContext } from "../../hostCore";
import { rn } from "../../hostUtils";
import {
  getCaravans,
  getDeals,
  getExportStagingLots,
  getGoods,
  getMarketById,
  getMarkets,
  getMerchantOrganizations,
  getNextCaravanId,
  getSimulationDay,
  getSimulationMonth,
  getWorldContext,
  setCaravans,
  setNextCaravanId
} from "../economyContext";
import { getBurgMarketLedger } from "./burgMarketLedgers";
import {
  CaravanMovement,
  type CaravanMovementSettings,
  DEFAULT_DRAFT_ANIMAL_ID,
  getDraftAnimalType
} from "./caravanMovement";
import { ExportStaging, getStaleLotDays, mergeUnitPrice } from "./exportStaging";
import {
  restoreFoodCoLoadToOrigin,
  settleFoodCoLoadOnArrival,
  settleFoodCoLoadOnLoss,
  tryCoLoadFoodOntoCaravan
} from "./foodCoLoad";
import { recordFoodDeliveredExport } from "./foodProcessingLedger";
import { type Good, isFreshFoodGood } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { type IncrementalBatchOptions, runBatchedYielding } from "./incrementalBatching";
import { discardLivestockCargo } from "./livestockLots";
import { utilizationOf } from "./marketFlowBudget";
import { Markets } from "./markets-generator";
import type {
  Caravan,
  Deal,
  ExportStagingLot,
  Market,
  TradePaymentTerms,
  TradeRouteSegment,
  TransportAllocation
} from "./marketTypes";
import { openBranch } from "./merchantIntelligence";
import {
  isLongDistanceTradeEnabled,
  MerchantTradeCapital,
  recordStaleLotCancelled,
  recordStaleSaleAtPort
} from "./merchantTradeCapital";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import {
  accruePortStorage,
  portWarehouseOwner,
  recordSeaDeparture,
  repositionIdleHulls,
  waitingPortBurgId
} from "./portWarehouses";
import { recordRouteTraffic } from "./publicWorks";
import { markRetailInventoryDirty } from "./retailInventory";
import { isAtPort, seaDepartureMarketId, seaDeparturePortBurgId, stageSegments } from "./seaRoutePorts";
import { isSeaClosed } from "./seaSeason";
import {
  buildCargoManifests,
  getGoodCargoSlotsPerUnit,
  getManifestCapacitySlots,
  getRouteCargoSlotsPerUnit,
  getTransportAllocations,
  MINIMUM_CARGO_SLOTS
} from "./tradeCargo";
import { recordCaravanCorridor } from "./tradeCorridorLedger";
import { TradeLogisticsSettings } from "./tradeLogisticsSettings";
import {
  getCaravanMaintenanceCost,
  getRouteMaxTemperatureC,
  isGoodTradePermitted,
  isGoodTradePermittedForShipment,
  MIN_TRADE_PROFIT
} from "./tradeOpportunityEstimator";
import {
  calculateRouteDurationDays,
  getRouteDistanceKm,
  getSurfaceSpeedMultiplier,
  getWaterSegmentSpeedKmPerDay
} from "./tradeRouteDuration";
import { TradeRoutePlanner } from "./tradeRoutePlanner";
import {
  decideSailDeparture,
  isLocalLandRoute,
  maxWaitDaysForRoute,
  nextScheduledSailDay,
  routeHasWater,
  sailDecisionFromReason
} from "./tradeSailSchedule";
import { TradeSecurity } from "./tradeSecurity";
import { getCargoDepartureObserver, getLotDispatchObserver, type LotDispatchOutcome } from "./tradeStageObserver";
import { TransportAssetOrders } from "./transportAssetOrders";

export type CaravanTravelLeg = { endKm: number; speedKmPerDay: number };

/** Halves a market's tracked `caravanArrivalVolume` roughly every two months of no new arrivals. */
const CARAVAN_VOLUME_HALF_LIFE_DAYS = 60;
const CARAVAN_VOLUME_DECAY_RATE = Math.LN2 / CARAVAN_VOLUME_HALF_LIFE_DAYS;
const UNIT_EPSILON = 0.000001;
const ARRIVAL_DISTANCE_EPSILON_KM = 0.001;

function payloadUsedSlots(caravan: Pick<Caravan, "payload">): number {
  return caravan.payload.reduce((sum, item) => {
    const slotsPerUnit = item.cargoSlotsPerUnit ?? 1;
    return sum + item.units * slotsPerUnit;
  }, 0);
}

/** Removes raw fresh cargo from an existing loading or transit caravan. */
function discardFreshPayload(caravan: Caravan): boolean {
  let changed = false;
  const surviving = caravan.payload.filter(item => {
    const good = getGoods().find(candidate => candidate.i === item.goodId);
    if (!good || !isFreshFoodGood(good)) return true;
    // No raw fresh cargo may remain on an existing loading/transit caravan after this rule
    // ships. It must be consumed or preserved at its origin instead.
    changed = true;
    if (caravan.sellerType === "market" && (item.lockedCapital ?? 0) > UNIT_EPSILON) {
      MerchantTradeCapital.settleLoss(caravan.seller, item.lockedCapital ?? 0);
    }
    if (caravan.buyerType === "market") MerchantTradeCapital.releaseEscrow(caravan.buyer, item.escrowAmount ?? 0);
    recordGoodFlow({
      direction: "sink",
      category: "spoilage",
      livestockCargoIds: item.livestockCargoIds,
      goodId: item.goodId,
      units: item.units,
      marketId: caravan.sellerType === "market" ? caravan.seller : undefined
    });
    return false;
  });
  if (!changed) return false;

  caravan.payload = surviving;
  caravan.units = rn(
    surviving.reduce((sum, item) => sum + item.units, 0),
    2
  );
  caravan.value = rn(
    surviving.reduce((sum, item) => sum + item.value, 0),
    2
  );
  return true;
}

function resolveMerchantOrganizationId(dispatcherMarketId: number | null | undefined): number | undefined {
  if (dispatcherMarketId === null || dispatcherMarketId === undefined) return undefined;
  return getMerchantOrganizations().find(organization => organization.homeMarketId === dispatcherMarketId)?.i;
}

function sameRouteBundle(
  caravan: Caravan,
  bundle: { seller: number; sellerType: string; buyer: number; buyerType: string }
): boolean {
  return (
    caravan.seller === bundle.seller &&
    caravan.sellerType === bundle.sellerType &&
    caravan.buyer === bundle.buyer &&
    caravan.buyerType === bundle.buyerType
  );
}

function appendPayloadFromManifest(
  caravan: Caravan,
  manifest: { items: { deal: Deal; units: number; cargoSlotsPerUnit: number }[] }
): number {
  let totalUnits = caravan.units;
  let totalValue = caravan.value;
  let addedSlots = 0;
  for (const item of manifest.items) {
    let units = item.units;
    let lockedCapital = 0;
    let goodsUnitCost: number | undefined;
    let saleUnitPrice: number | undefined;
    let paymentTerms: TradePaymentTerms | undefined;
    let escrowAmount = 0;
    let freshnessAgeDays: number | undefined;
    let livestockCargoIds: string[] | undefined;
    const good = getGoods().find(candidate => candidate.i === item.deal.good);
    // selectRouteCargo normally prevents this. Keep this boundary fail-closed so a stale
    // manifest, strategic caller, or user-edited catalogue cannot put raw food on a caravan.
    if (!good || isFreshFoodGood(good)) continue;
    // Prefer export-warehouse take when the deal (or pseudo-deal) is backed by a staging lot.
    if (item.deal.stagingLotId !== undefined) {
      const taken = ExportStaging.takeFromLot(item.deal.stagingLotId, item.units);
      units = taken.units;
      lockedCapital = taken.lockedCapital;
      goodsUnitCost = taken.goodsUnitCost;
      saleUnitPrice = taken.saleUnitPrice;
      paymentTerms = taken.paymentTerms;
      escrowAmount = taken.escrowAmount ?? 0;
      freshnessAgeDays = taken.freshnessAgeDays;
      livestockCargoIds = taken.livestockCargoIds;
      if (units <= UNIT_EPSILON) continue;
      item.deal.remainingUnits = Math.max(0, (item.deal.remainingUnits ?? item.deal.units) - units);
    } else {
      const remainingUnits = item.deal.remainingUnits ?? item.deal.units;
      item.deal.remainingUnits = Math.max(0, remainingUnits - units);
    }
    item.deal.spawned = (item.deal.remainingUnits ?? 0) <= UNIT_EPSILON;

    const value = item.deal.price * units;
    totalUnits += units;
    totalValue += value;
    addedSlots += units * item.cargoSlotsPerUnit;
    const existing = caravan.payload.find(
      entry =>
        entry.dealId === item.deal.i && entry.goodId === item.deal.good && entry.stagingLotId === item.deal.stagingLotId
    );
    if (existing) {
      if (livestockCargoIds?.length)
        existing.livestockCargoIds = [...(existing.livestockCargoIds ?? []), ...livestockCargoIds];
      existing.goodsUnitCost = mergeUnitPrice(existing.goodsUnitCost, existing.units, goodsUnitCost, units);
      existing.saleUnitPrice = mergeUnitPrice(existing.saleUnitPrice, existing.units, saleUnitPrice, units);
      if (escrowAmount > 0) existing.escrowAmount = rn((existing.escrowAmount ?? 0) + escrowAmount, 2);
      existing.units += units;
      existing.value += value;
      existing.lockedCapital = (existing.lockedCapital ?? 0) + lockedCapital;
      if (freshnessAgeDays !== undefined) {
        existing.freshnessAgeDays = Math.max(existing.freshnessAgeDays ?? 0, freshnessAgeDays);
      }
    } else {
      caravan.payload.push({
        livestockCargoIds,
        goodId: item.deal.good,
        dealId: item.deal.i,
        units,
        value,
        cargoSlotsPerUnit: item.cargoSlotsPerUnit,
        strategicProcurementOrderId: item.deal.strategicProcurementOrderId,
        stagingLotId: item.deal.stagingLotId,
        lockedCapital: lockedCapital > UNIT_EPSILON ? lockedCapital : undefined,
        goodsUnitCost,
        saleUnitPrice,
        paymentTerms,
        escrowAmount: escrowAmount > 0 ? escrowAmount : undefined,
        freshnessAgeDays
      });
    }
  }
  caravan.units = rn(totalUnits, 2);
  caravan.value = rn(totalValue, 2);
  return addedSlots;
}

/** Return loading cargo to the exporter market retail stock when a thin hold is cancelled. */
function restoreLoadingCargoToOrigin(caravan: Caravan): void {
  if (caravan.sellerType !== "market") return;
  restoreFoodCoLoadToOrigin(caravan);
  for (const item of caravan.payload) {
    if (item.isFoodCoLoad) continue;
    ExportStaging.returnUnitsToRetail(caravan.seller, item.goodId, item.units, item.livestockCargoIds);
    if ((item.lockedCapital ?? 0) > UNIT_EPSILON) {
      const goodsRefund = item.goodsUnitCost === undefined ? undefined : rn(item.units * item.goodsUnitCost, 2);
      MerchantTradeCapital.unlock(caravan.seller, item.lockedCapital ?? 0, goodsRefund);
    }
    if (caravan.buyerType === "market") MerchantTradeCapital.releaseEscrow(caravan.buyer, item.escrowAmount ?? 0);
  }
}

function settlePayloadCapital(caravan: Caravan, outcome: "arrived" | "lost"): void {
  if (caravan.sellerType !== "market") return;
  const buyerMarket = caravan.buyerType === "market" ? getMarketById(caravan.buyer) : undefined;
  for (const item of caravan.payload) {
    if (item.isFoodCoLoad) continue;
    if (outcome === "lost") discardLivestockCargo(item.livestockCargoIds);
    const locked = item.lockedCapital ?? 0;
    if (!(locked > UNIT_EPSILON)) continue;
    if (outcome === "lost") {
      MerchantTradeCapital.settleLoss(caravan.seller, locked);
      // The seller bears the loss on the road; the buyer's escrow goes back to it.
      if (buyerMarket) MerchantTradeCapital.releaseEscrow(buyerMarket.i, item.escrowAmount ?? 0);
      continue;
    }
    // The importer buys at the price the house knew when it struck the deal; cargo booked before
    // that price was kept sells at today's price there.
    const unitPrice = item.saleUnitPrice ?? buyerMarket?.goods[item.goodId]?.price ?? 0;
    MerchantTradeCapital.settleArrival(
      caravan.seller,
      locked,
      buyerMarket?.i,
      item.units * unitPrice,
      item.escrowAmount ?? 0
    );
  }
}

/** Flags the warehouse lots of a pass that found no free transport, for the daily retry. */
function markAwaitingTransport(deals: readonly Deal[]): void {
  const ids = new Set(deals.map(deal => deal.stagingLotId).filter((id): id is number => id !== undefined));
  if (!ids.size) return;
  for (const lot of getExportStagingLots())
    if (ids.has(lot.id) && lot.units > UNIT_EPSILON) lot.awaitingTransport = true;
}

/** Staging lots → deal-shaped rows so buildCargoManifests can pack them. */
function stagingLotsToDeals(lots: readonly ExportStagingLot[]): Deal[] {
  const liveDeals = getDeals();
  return lots
    .filter(lot => lot.units > UNIT_EPSILON)
    .map(lot => {
      // Deal ids restart every production cycle, so a lot booked in an earlier cycle can share its
      // `dealId` with an unrelated deal of this one. Two lots under one id were packed as one
      // manifest row of the first lot's good: the hold came out over capacity and never sailed
      // (long-distance-merchant-reach-capital.md §16).
      const linked =
        lot.dealId !== undefined
          ? liveDeals.find(deal => deal.i === lot.dealId && deal.stagingLotId === lot.id)
          : undefined;
      return {
        i: linked?.i ?? -lot.id,
        seller: lot.marketId,
        sellerType: "market" as const,
        buyer: lot.destinationMarketId,
        buyerType: "market" as const,
        good: lot.goodId,
        units: lot.units,
        remainingUnits: lot.units,
        price: lot.unitCost,
        tax: (lot.taxPerUnit ?? 0) * lot.units,
        distance: lot.distance ?? linked?.distance,
        durationDays: lot.durationDays ?? linked?.durationDays,
        maintenanceCost: lot.maintenanceCost ?? linked?.maintenanceCost,
        stagingLotId: lot.id,
        spawned: false
      };
    });
}

type RouteBundle = {
  seller: number;
  sellerType: "burg" | "market";
  buyer: number;
  buyerType: "burg" | "market";
  deals: Deal[];
};

/** Route km of the shipment's current stage (§10.19); the whole route without a port transfer. */
function stageDistanceKm(caravan: Caravan): number {
  const transfer = caravan.portTransfer;
  if (!transfer) return caravan.totalDistance;
  return transfer.atPort ? Math.max(0, caravan.totalDistance - transfer.atKm) : transfer.atKm;
}

/**
 * Where a route's inland stage sets its cargo down for the ship: a route that reaches its first sea
 * leg overland or down river is shipped in two stages (port-freight-queue-and-warehouses.md §4.1,
 * §10.19). A route that starts at sea is already at its zero-length port transfer (§10.32).
 */
function planPortTransfer(routeSegments: readonly TradeRouteSegment[], distanceScale: number): Caravan["portTransfer"] {
  const seaSegmentIndex = routeSegments.findIndex(segment => segment.type === "sea" || segment.type === "water");
  if (seaSegmentIndex < 0) return undefined;
  if (seaSegmentIndex === 0) {
    const portBurgId = seaDeparturePortBurgId(routeSegments);
    return portBurgId === undefined ? undefined : { seaSegmentIndex: 0, atKm: 0, portBurgId, atPort: true };
  }
  const atKm = getRouteDistanceKm(routeSegments.slice(0, seaSegmentIndex), distanceScale);
  const portBurgId = seaDeparturePortBurgId(routeSegments);
  if (!(atKm > ARRIVAL_DISTANCE_EPSILON_KM) || portBurgId === undefined) return undefined;
  return { seaSegmentIndex, atKm, portBurgId };
}

/** Bring persisted loading rows in line with the current route-aware commercial policy. */
function refreshLoadingPolicy(caravan: Caravan): void {
  if (caravan.state !== "loading" || !caravan.loading) return;
  const logistics = TradeLogisticsSettings.getOptions();
  // Older saves did not mark a shipment that starts in port as a warehouse consignment.
  if (!caravan.portTransfer && routeNeedsSeaHulls(caravan.routeSegments.slice(0, 1))) {
    caravan.portTransfer = planPortTransfer(caravan.routeSegments, getWorldContext().distanceScale);
    if (isAtPort(caravan))
      caravan.loading.plannedCapacitySlots = Math.max(
        payloadUsedSlots(caravan),
        portHoldSlots(caravan, caravan.routeSegments)
      );
  }
  const segments = stageSegments(caravan);
  caravan.loading.maxWaitDays = maxWaitDaysForRoute(segments, stageDistanceKm(caravan), {
    maxWaitDaysLand: logistics.maxWaitDaysLand,
    maxWaitDaysSea: logistics.maxWaitDaysSea,
    maxWaitDaysShortSea: logistics.maxWaitDaysShortSea,
    shortSeaDistanceKm: logistics.shortSeaDistanceKm
  });
  // Cargo bound for the port warehouse goes however little it fills a cart: it is not called
  // off as thin and sent back (§10.19). Cargo already in port follows its sea loading policy.
  if (caravan.portTransfer && !isAtPort(caravan)) caravan.loading.minSailUtilization = 0;
  // Paid cargo by road goes once its wait is over, however little of a cart it fills: carriers
  // took mixed loads, and the house had bought the goods for that buyer (§10.24).
  if (
    !routeHasWater(segments) &&
    caravan.sellerType === "market" &&
    caravan.buyerType === "market" &&
    isLongDistanceTradeEnabled()
  )
    caravan.loading.minSailUtilization = 0;

  // Carts have no sailing calendar. Clear stale fields from saves made before this distinction.
  if (!routeHasWater(segments)) {
    caravan.loading.sailScheduleDays = undefined;
    caravan.loading.nextSailDay = undefined;
  }
}

/**
 * P0 finite sea fleet (docs/plan/vessel-itinerary-and-finite-trade-fleet.md):
 * when Shipbuilding publishes merchant hulls, open-water segments may not sail on
 * abstract capacity — a reservation must bind at least one shipHullId.
 * Land/river durable assets already refuse departure without a reservation.
 */
function reservationHasShipHulls(reservation: ReturnType<typeof MerchantTransportAssets.reserve>): boolean {
  if (!reservation) return false;
  return reservation.reservation.allocations.some(
    allocation => allocation.mode === "water" && (allocation.shipHullIds?.length ?? 0) > 0
  );
}

function routeNeedsSeaHulls(routeSegments: readonly TradeRouteSegment[]): boolean {
  return routeSegments.some(segment => segment.type === "water" || segment.type === "sea");
}

/** Whether the port this stage's sea leg sails from is closed for the season (§10.27). */
function isLaidUp(caravan: Caravan): boolean {
  const segments = stageSegments(caravan);
  return routeNeedsSeaHulls(segments) && isSeaClosed(seaDeparturePortBurgId(segments));
}

/** Whether a planned allocation + optional reservation may leave the loading berth. */
function canDepartWithTransportAssets(
  allocations: readonly TransportAllocation[],
  reservation: ReturnType<typeof MerchantTransportAssets.reserve>,
  routeSegments: readonly TradeRouteSegment[]
): boolean {
  const hasLandTransport = allocations.some(allocation => allocation.mode === "land" && allocation.unitCount > 0);
  const hasRiverTransport = allocations.some(allocation => allocation.mode === "river" && allocation.unitCount > 0);
  if (hasLandTransport && !reservation) return false;
  if (hasRiverTransport && !reservation) return false;

  const needsSeaHulls =
    routeNeedsSeaHulls(routeSegments) ||
    allocations.some(allocation => allocation.mode === "water" && allocation.usedSlots > UNIT_EPSILON);
  if (needsSeaHulls && MerchantTransportAssets.isWaterAssetModeActive()) {
    return reservationHasShipHulls(reservation);
  }
  return true;
}

function resolveEndpointBurgId(endpointType: "burg" | "market", endpointId: number): number | null {
  if (endpointType === "burg") return endpointId;
  const market = getMarketById(endpointId);
  return market?.centerBurgId ?? null;
}

function caravanItinerary(caravan: Pick<Caravan, "seller" | "sellerType" | "buyer" | "buyerType" | "portTransfer">): {
  originBurgId: number | null;
  destinationBurgId: number | null;
} {
  return {
    // The sea stage of a transferred shipment leaves from the port it was set down at (§10.19).
    originBurgId: caravan.portTransfer?.atPort
      ? caravan.portTransfer.portBurgId
      : resolveEndpointBurgId(caravan.sellerType, caravan.seller),
    destinationBurgId: resolveEndpointBurgId(caravan.buyerType, caravan.buyer)
  };
}

/** Itinerary for a reservation: the endpoints, and the port the sea leg leaves from (§10.7). */
function reservationItinerary(
  caravan: Pick<Caravan, "seller" | "sellerType" | "buyer" | "buyerType" | "portTransfer">,
  routeSegments: readonly TradeRouteSegment[]
) {
  return { ...caravanItinerary(caravan), seaPortMarketId: seaDepartureMarketId(routeSegments) };
}

/** Push live caravan progress onto Shipbuilding hull itineraries (finite fleet P1). */
function publishCaravanHullPositions(caravans: readonly Caravan[]): void {
  const updates: {
    hullId: number;
    caravanId: number;
    originBurgId: number | null;
    destinationBurgId: number | null;
    progress: number;
    phase: "transit" | "loading";
  }[] = [];

  for (const caravan of caravans) {
    if (caravan.state !== "transit" && caravan.state !== "loading") continue;
    const hullIds = (caravan.transportAllocations ?? []).flatMap(allocation => allocation.shipHullIds ?? []);
    if (!hullIds.length) continue;
    const { originBurgId, destinationBurgId } = caravanItinerary(caravan);
    const startKm = caravan.portTransfer?.atPort ? caravan.portTransfer.atKm : 0;
    const stageKm = caravan.totalDistance - startKm;
    const progress =
      caravan.state === "loading"
        ? 0
        : stageKm > 0
          ? Math.max(0, Math.min(1, (caravan.currentDistance - startKm) / stageKm))
          : 0;
    for (const hullId of hullIds) {
      updates.push({
        hullId,
        caravanId: caravan.i,
        originBurgId,
        destinationBurgId,
        progress,
        phase: caravan.state === "loading" ? "loading" : "transit"
      });
    }
  }

  if (!updates.length) return;
  simEvents.dispatchEvent(new CustomEvent("fmg:economy-caravan-hull-positions", { detail: { updates } }));
}

/**
 * Days more that sea cargo waits in port for a ship than cargo for the road. Durable goods lay in
 * the port warehouses for a season: the Hanse laid ships up from Martinmas to Candlemas and the
 * cargo waited the winter for the spring sailing, and cargo for the monsoon voyages waited months
 * for the wind (port-freight-queue-and-warehouses.md §4.4, §10.11). Perishable cargo spoils first
 * by its freshness clock.
 */
const PORT_SEASON_WAIT_DAYS = 90;

/**
 * Days beyond its loading wait that a thin hold of paid cargo in port waits for more freight to the
 * same port before it sails as it is. A master took on freight for weeks before he sailed, and the
 * merchant's goods lay on the quay meanwhile rather than going back to the shop (§10.25).
 */
const PORT_THIN_HOLD_DAYS = 30;

/** Paid cargo in its port of departure, which waits for a fuller hold instead of being called off. */
function holdsThinInPort(caravan: Caravan): boolean {
  return (
    caravan.sellerType === "market" &&
    caravan.buyerType === "market" &&
    isLongDistanceTradeEnabled() &&
    waitingPortBurgId(caravan) !== undefined
  );
}

/**
 * Share of the port's own price that cargo given up on fetches there: a forced sale to the port's
 * dealers, who took the risk of the next sailing (port-freight-queue-and-warehouses.md §4.4).
 */
const STALE_SALE_DISCOUNT = 0.7;

/**
 * Staple food that spoiled waiting in port comes off the cargo when it sails or is sold; the house
 * bears its cost and the importer's escrow for it is released (§4.4).
 */
function takePortSpoilage(caravan: Caravan): void {
  const spoiled = caravan.loading?.portSpoiledUnits;
  if (!spoiled || !caravan.loading) return;
  caravan.loading.portSpoiledUnits = undefined;
  let changed = false;
  for (const [key, lostUnits] of Object.entries(spoiled)) {
    const goodId = Number(key);
    const items = caravan.payload.filter(item => item.goodId === goodId && !item.isFoodCoLoad);
    const total = items.reduce((sum, item) => sum + item.units, 0);
    if (!(total > UNIT_EPSILON) || !(lostUnits > UNIT_EPSILON)) continue;
    const share = Math.min(1, lostUnits / total);
    for (const item of items) {
      const lost = rn(item.units * share, 2);
      if (!(lost > UNIT_EPSILON)) continue;
      const itemShare = lost / item.units;
      const locked = rn((item.lockedCapital ?? 0) * itemShare, 2);
      const escrow = rn((item.escrowAmount ?? 0) * itemShare, 2);
      if (caravan.sellerType === "market") MerchantTradeCapital.settleLoss(caravan.seller, locked);
      if (caravan.buyerType === "market") MerchantTradeCapital.releaseEscrow(caravan.buyer, escrow);
      if (item.lockedCapital !== undefined) item.lockedCapital = rn(Math.max(0, item.lockedCapital - locked), 2);
      if (item.escrowAmount !== undefined) item.escrowAmount = rn(Math.max(0, item.escrowAmount - escrow), 2);
      item.value = rn(item.value * (1 - itemShare), 2);
      item.units = rn(Math.max(0, item.units - lost), 2);
      recordGoodFlow({
        direction: "sink",
        category: "spoilage",
        livestockCargoIds: item.livestockCargoIds,
        goodId,
        units: lost,
        marketId: caravan.sellerType === "market" ? caravan.seller : undefined
      });
      changed = true;
    }
  }
  if (!changed) return;
  caravan.payload = caravan.payload.filter(item => item.units > UNIT_EPSILON);
  caravan.units = rn(
    caravan.payload.reduce((sum, item) => sum + item.units, 0),
    2
  );
  caravan.value = rn(
    caravan.payload.reduce((sum, item) => sum + item.value, 0),
    2
  );
}

/** The rent the cargo ran up in port, paid by its house to the port's warehouse owners (§10.20). */
function payPortStorage(caravan: Caravan, portBurgId: number | undefined): void {
  takePortSpoilage(caravan);
  const due = caravan.loading?.portStorageDue ?? 0;
  if (caravan.loading) caravan.loading.portStorageDue = undefined;
  if (portBurgId === undefined || caravan.sellerType !== "market" || !(due > 0)) return;
  MerchantTradeCapital.payPortStorage(caravan.seller, due, portBurgId, portWarehouseOwner(portBurgId));
}

/**
 * Sea cargo given up on in port is not carted home: the house sells it to the port's market at a
 * discount and bears the loss (§4.4, §10.20). Cargo lying at its own market's port goes back into
 * that market's stock, which pays the discounted price for it.
 */
function sellStaleCargoAtPort(caravan: Caravan, portBurgId: number): void {
  const burgMarket = getWorldContext().pack.burgs?.[portBurgId]?.market;
  const portMarket = getMarketById(typeof burgMarket === "number" ? burgMarket : caravan.seller);
  if (!portMarket || caravan.sellerType !== "market") {
    restoreLoadingCargoToOrigin(caravan);
    return;
  }
  payPortStorage(caravan, portBurgId);
  restoreFoodCoLoadToOrigin(caravan);
  let cost = 0;
  let saleValue = 0;
  for (const item of caravan.payload) {
    if (item.isFoodCoLoad) continue;
    const local = portMarket.goods[item.goodId]?.price ?? 0;
    const price = local > 0 ? local : (item.goodsUnitCost ?? 0);
    const sale = rn(item.units * price * STALE_SALE_DISCOUNT, 2);
    const locked = item.lockedCapital ?? 0;
    cost += locked;
    saleValue += sale;
    ExportStaging.returnUnitsToRetail(portMarket.i, item.goodId, item.units, item.livestockCargoIds);
    if (portMarket.i === caravan.seller) {
      if (locked > UNIT_EPSILON) MerchantTradeCapital.unlock(caravan.seller, locked, sale);
    } else {
      if (locked > UNIT_EPSILON)
        MerchantTradeCapital.settleArrival(caravan.seller, locked, portMarket.i, sale, 0, false);
    }
    if (caravan.buyerType === "market") MerchantTradeCapital.releaseEscrow(caravan.buyer, item.escrowAmount ?? 0);
  }
  markRetailInventoryDirty(portMarket.i);
  recordStaleSaleAtPort(cost, saleValue);
}

/**
 * A paid shipment that is due to sail but finds no carts or hull free keeps waiting, up to the
 * same limit as a warehouse lot, and sea cargo a season more; then it is called off. Cargo still at
 * its origin goes back there with its capital (docs/plan/long-distance-merchant-reach-capital.md
 * §5.3, §15); cargo waiting in port is sold there (§10.20).
 */
function waitForTransport(caravan: Caravan): "waiting" | "cancelled" {
  if (!caravan.loading || caravan.sellerType !== "market" || !isLongDistanceTradeEnabled()) return "waiting";
  const segments = stageSegments(caravan);
  const durationDays = calculateRouteDurationDays(segments, getWorldContext().distanceScale);
  const seaWait = routeNeedsSeaHulls(segments) ? PORT_SEASON_WAIT_DAYS : 0;
  if (caravan.loading.waitedDays <= getStaleLotDays({ durationDays }) + seaWait) return "waiting";
  const portBurgId = waitingPortBurgId(caravan);
  if (portBurgId !== undefined) sellStaleCargoAtPort(caravan, portBurgId);
  else {
    recordStaleLotCancelled(caravan.payload.reduce((sum, item) => sum + (item.lockedCapital ?? 0), 0));
    restoreLoadingCargoToOrigin(caravan);
  }
  caravan.state = "lost";
  return "cancelled";
}

function tryDepartLoadingCaravan(caravan: Caravan): "departed" | "waiting" | "cancelled" {
  if (caravan.state !== "loading" || !caravan.loading) return "waiting";

  // Defensive cleanup before co-load/departure also prevents one-tick display of raw fresh cargo
  // restored from a save or passed through an obsolete caller.
  if (discardFreshPayload(caravan) && !caravan.payload.length) {
    caravan.state = "lost";
    return "cancelled";
  }

  refreshLoadingPolicy(caravan);
  const segments = stageSegments(caravan);
  const atPort = isAtPort(caravan);

  // Co-load staple food into free space first so it counts toward sail utilization
  // (historical ballast / bulk grain riding with higher-value general cargo). The exporter's food
  // is at home, not in the port warehouse.
  const atOrigin = !atPort || caravan.portTransfer?.atKm === 0;
  if (!routeHasWater(segments) && payloadUsedSlots(caravan) <= UNIT_EPSILON) return departDrove(caravan, segments);
  if (atOrigin) tryCoLoadFoodOntoCaravan(caravan, { distanceScale: getWorldContext().distanceScale });

  const usedSlots = payloadUsedSlots(caravan);
  const planned = caravan.loading.plannedCapacitySlots;
  const util = utilizationOf(usedSlots, planned);
  const dayOfMonth = getSimulationDay();
  const logistics = TradeLogisticsSettings.getOptions();
  const waterRoute = routeHasWater(segments);
  const sailDays = waterRoute
    ? caravan.loading.sailScheduleDays?.length
      ? caravan.loading.sailScheduleDays
      : logistics.sailDays
    : [];
  if (waterRoute) {
    caravan.loading.nextSailDay = nextScheduledSailDay(dayOfMonth, sailDays);
    caravan.loading.sailScheduleDays = [...sailDays];
  }

  const reason = decideSailDeparture({
    utilization: util,
    targetUtilization: caravan.loading.targetUtilization,
    minSailUtilization: caravan.loading.minSailUtilization,
    waitedDays: caravan.loading.waitedDays,
    maxWaitDays: caravan.loading.maxWaitDays,
    dayOfMonth,
    sailDays,
    immediateDispatch: isLocalLandRoute(segments, stageDistanceKm(caravan)),
    unitEpsilon: UNIT_EPSILON
  });
  const decision = sailDecisionFromReason(reason);
  caravan.departReason = reason === "waiting" ? "waiting" : reason;

  if (decision === "waiting") return "waiting";
  if (decision === "cancelled") {
    if (!holdsThinInPort(caravan)) {
      restoreLoadingCargoToOrigin(caravan);
      caravan.state = "lost";
      return "cancelled";
    }
    if (caravan.loading.waitedDays < caravan.loading.maxWaitDays + PORT_THIN_HOLD_DAYS) {
      caravan.departReason = "waiting";
      return "waiting";
    }
    caravan.departReason = "depart-overdue";
  }

  // A consignment gathered in port can need several of the road vehicles actually available.
  const dispatcherMarketId =
    caravan.transportDispatcherMarketId ?? MerchantTransportAssets.getDispatcherMarketId(caravan);
  if (dispatcherMarketId === null) return waitForTransport(caravan);
  let allocations = getTransportAllocations(segments, Math.max(usedSlots, UNIT_EPSILON), caravan.draftAnimalId, atPort);
  for (const allocation of allocations) allocation.usedSlots = usedSlots;
  if (atPort && allocations.some(allocation => allocation.mode === "land")) {
    const convoy = MerchantTransportAssets.getAvailableLandConvoy(dispatcherMarketId, usedSlots, caravan.draftAnimalId);
    if (!convoy) return waitForTransport(caravan);
    allocations = [...convoy, ...allocations.filter(allocation => allocation.mode !== "land")];
  }
  const capacitySlots = getManifestCapacitySlots(allocations);
  if (capacitySlots <= 0 || usedSlots > capacitySlots + UNIT_EPSILON) return waitForTransport(caravan);

  const reservation = MerchantTransportAssets.reserve(
    dispatcherMarketId,
    caravan.i,
    allocations,
    reservationItinerary(caravan, caravan.routeSegments)
  );
  if (!canDepartWithTransportAssets(allocations, reservation, segments)) {
    return waitForTransport(caravan);
  }

  caravan.transportAllocations = reservation?.reservation.allocations ?? allocations;
  caravan.transportReservationId = reservation?.reservation.id;
  caravan.transportDispatcherMarketId = reservation?.dispatcherMarketId ?? dispatcherMarketId;
  caravan.merchantOrganizationId ??= resolveMerchantOrganizationId(dispatcherMarketId);
  payPortStorage(caravan, waitingPortBurgId(caravan));
  caravan.state = "transit";
  // A departing shipment is what wears a road in; recorded at departure rather than arrival so a
  // corridor whose caravans keep getting robbed still counts as used traffic (L8 stage 2). A
  // transferred shipment wears each stage as it travels it, and leaves its origin once.
  recordRouteTraffic(segments);
  if (atOrigin) recordCaravanCorridor(caravan);
  if (routeNeedsSeaHulls(segments)) recordSeaDeparture(caravan, caravan.transportDispatcherMarketId);
  caravan.loading = undefined;
  getCargoDepartureObserver()?.(caravan);
  if (reservation) MerchantTransportAssets.depart(reservation.reservation.id);
  return "departed";
}

/**
 * Livestock that never leaves the road walks in a drove and needs no cart, so it sets off as soon
 * as it is gathered (docs/plan/goods-physical-units.md §5.4.5, §12.4).
 */
function departDrove(caravan: Caravan, segments: readonly TradeRouteSegment[]): "departed" {
  caravan.transportAllocations = [];
  caravan.merchantOrganizationId ??= resolveMerchantOrganizationId(
    MerchantTransportAssets.getDispatcherMarketId(caravan)
  );
  caravan.state = "transit";
  caravan.departReason = "depart-local";
  getCargoDepartureObserver()?.(caravan);
  recordRouteTraffic(segments);
  recordCaravanCorridor(caravan);
  caravan.loading = undefined;
  return "departed";
}

function payloadValuePerSlot(caravan: Caravan): number {
  const slots = payloadUsedSlots(caravan);
  return slots > UNIT_EPSILON ? caravan.payload.reduce((sum, item) => sum + item.value, 0) / slots : 0;
}

/** Land shipments in their own order, then sea shipments by value per slot, dearest first. */
/**
 * Whether older cargo of the same house waits at the landing for a river barge. Barges are built
 * for the cargo waiting for one, and the boat went to the cargo that came first; a new shipment
 * leaves after it, in the daily loading pass (port-freight-queue-and-warehouses.md §10.11).
 */
function waitsBehindAtLanding(caravan: Caravan): boolean {
  const hasRiver = (route: readonly TradeRouteSegment[]) => route.some(segment => segment.type === "river");
  if (!hasRiver(stageSegments(caravan))) return false;
  return getCaravans().some(
    other =>
      other.i < caravan.i &&
      other.state === "loading" &&
      !isAtPort(other) &&
      other.transportDispatcherMarketId === caravan.transportDispatcherMarketId &&
      hasRiver(stageSegments(other))
  );
}

function loadingOrder(caravans: readonly Caravan[]): Caravan[] {
  const land: Caravan[] = [];
  const sea: { caravan: Caravan; value: number }[] = [];
  for (const caravan of caravans) {
    if (caravan.state !== "loading" || !caravan.loading) continue;
    if (routeNeedsSeaHulls(stageSegments(caravan))) sea.push({ caravan, value: payloadValuePerSlot(caravan) });
    else land.push(caravan);
  }
  sea.sort((a, b) => b.value - a.value);
  return [...land, ...sea.map(entry => entry.caravan)];
}

/**
 * The hold a consignment in the port warehouse gathers toward: the largest hull free at the port,
 * or afloat when none is (as cargo is packed for a ship that is coming, §10.11). Without a finite
 * fleet, the largest ship class.
 */
function portHoldSlots(caravan: Caravan, segments: readonly TradeRouteSegment[]): number {
  const sea = segments.filter(segment => segment.type === "sea" || segment.type === "water");
  const dispatcherMarketId =
    caravan.transportDispatcherMarketId ?? MerchantTransportAssets.getDispatcherMarketId(caravan);
  if (MerchantTransportAssets.isWaterAssetModeActive() && dispatcherMarketId !== null) {
    const largest = MerchantTransportAssets.getLargestAvailableRouteCapacity(
      dispatcherMarketId,
      sea,
      caravan.draftAnimalId,
      { awaitVessel: true }
    );
    if (Number.isFinite(largest) && largest > 0) return largest;
  }
  return getManifestCapacitySlots(getTransportAllocations(sea, Number.POSITIVE_INFINITY, caravan.draftAnimalId));
}

/**
 * The inland stage reaches the port (port-freight-queue-and-warehouses.md §4.1, §10.19). Its carts
 * go home, a barge stays at the port's landing, and the cargo lies in the port warehouse for a
 * ship. A later load of the same house for the same buyer goes into the consignment already
 * waiting there while the hold has room: the factor at the port shipped the goods of many carts in
 * one ship. The load merged away ends here, its cargo carried on by the consignment.
 */
function setDownAtPort(caravan: Caravan): void {
  const transfer = caravan.portTransfer;
  if (!transfer) return;
  caravan.currentDistance = transfer.atKm;
  const portMarketId = getWorldContext().pack.burgs?.[transfer.portBurgId]?.market;
  MerchantTransportAssets.settleCaravan(
    {
      transportReservationId: caravan.transportReservationId,
      buyer: typeof portMarketId === "number" ? portMarketId : undefined,
      buyerType: "market"
    },
    "arrived"
  );
  caravan.transportReservationId = undefined;
  transfer.atPort = true;

  const segments = stageSegments(caravan);
  const slots = payloadUsedSlots(caravan);
  const consignment = getCaravans().find(
    other =>
      other !== caravan &&
      other.state === "loading" &&
      other.loading &&
      other.portTransfer?.atPort &&
      other.portTransfer.portBurgId === transfer.portBurgId &&
      sameRouteBundle(other, caravan) &&
      payloadUsedSlots(other) + slots <= other.loading.plannedCapacitySlots + UNIT_EPSILON
  );
  if (consignment) {
    consignment.payload.push(...caravan.payload);
    consignment.units = rn(consignment.units + caravan.units, 2);
    consignment.value = rn(consignment.value + caravan.value, 2);
    caravan.payload = [];
    caravan.units = 0;
    caravan.value = 0;
    caravan.state = "arrived";
    return;
  }

  const logistics = TradeLogisticsSettings.getOptions();
  caravan.state = "loading";
  caravan.departReason = "waiting";
  caravan.transportAllocations = getTransportAllocations(segments, slots, caravan.draftAnimalId, true).map(
    allocation => ({ ...allocation, usedSlots: slots })
  );
  caravan.loading = {
    waitedDays: 0,
    maxWaitDays: logistics.maxWaitDaysSea,
    targetUtilization: logistics.targetUtilization,
    minSailUtilization: 0,
    plannedCapacitySlots: Math.max(slots, portHoldSlots(caravan, segments)),
    sailScheduleDays: [...logistics.sailDays],
    nextSailDay: nextScheduledSailDay(getSimulationDay(), logistics.sailDays)
  };
  refreshLoadingPolicy(caravan);
}

function decayCaravanArrivalVolume(markets: readonly Market[], deltaDays: number): void {
  if (deltaDays <= 0) return;
  const decay = Math.exp(-CARAVAN_VOLUME_DECAY_RATE * deltaDays);
  for (const market of markets) {
    if (!market.caravanArrivalVolume) continue;
    const decayed = market.caravanArrivalVolume * decay;
    market.caravanArrivalVolume = decayed < 0.01 ? 0 : decayed;
  }
}

/** Travel-time summary for an in-transit caravan, rounded up to whole simulation days. */
export interface CaravanTravelTime {
  totalDays: number;
  remainingDays: number;
}

/**
 * Returns the journey's total and remaining duration using the speeds baked when the caravan
 * departed. This keeps the ETA stable when movement preferences change after departure.
 */
export function getCaravanTravelTime(caravan: Caravan): CaravanTravelTime | null {
  const legs = caravan.travelLegs;
  if (legs?.length) {
    let previousEndKm = 0;
    let totalDays = 0;
    let remainingDays = 0;

    for (const leg of legs) {
      const legDistanceKm = leg.endKm - previousEndKm;
      if (
        !Number.isFinite(legDistanceKm) ||
        !Number.isFinite(leg.speedKmPerDay) ||
        legDistanceKm < 0 ||
        leg.speedKmPerDay <= 0
      ) {
        return null;
      }

      totalDays += legDistanceKm / leg.speedKmPerDay;
      const remainingDistanceKm = Math.max(0, leg.endKm - Math.max(caravan.currentDistance, previousEndKm));
      remainingDays += remainingDistanceKm / leg.speedKmPerDay;
      previousEndKm = leg.endKm;
    }

    return { totalDays: Math.ceil(totalDays), remainingDays: Math.ceil(remainingDays) };
  }

  // Saved maps from before travel legs were persisted do not retain per-leg speeds. Their
  // duration is therefore an approximation based on the current route settings.
  const totalDays = calculateRouteDurationDays(caravan.routeSegments, getWorldContext().distanceScale, {
    draftAnimalId: caravan.draftAnimalId
  });
  if (!Number.isFinite(totalDays) || caravan.totalDistance <= 0) return null;

  const remainingRatio = Math.max(0, 1 - caravan.currentDistance / caravan.totalDistance);
  return { totalDays, remainingDays: Math.ceil(totalDays * remainingRatio) };
}

function toTradeRoutePoint(point: readonly number[]): TradeRouteSegment["points"][number] {
  return typeof point[2] === "number" ? [point[0], point[1], point[2]] : [point[0], point[1]];
}

export interface CaravanTickResult {
  arrived: Caravan[];
  lost: Caravan[];
}

/**
 * Bake planar legs + speeds at spawn so tick-time advance does not re-sample grade
 * (or re-read sea current). `currentDistance` remains cumulative planar km (plan A).
 * `worldContext`, if given, resolves each sea leg's real per-cell ocean current at its starting
 * cell; omit it (as existing callers/tests do) to keep the coarse seasonal-only fallback.
 */
export function bakeCaravanTravelLegs(
  segments: readonly TradeRouteSegment[],
  distanceScale: number,
  draftAnimalId: string,
  movement: CaravanMovementSettings,
  month: number,
  heights: ArrayLike<number> | null,
  heightExponent: number,
  worldContext?: WorldContext | null
): CaravanTravelLeg[] {
  const animal = getDraftAnimalType(draftAnimalId);
  const legs: CaravanTravelLeg[] = [];
  let cursorKm = 0;

  for (const seg of segments) {
    if (seg.points.length < 2) continue;

    if (seg.type === "water" || seg.type === "sea" || seg.type === "river") {
      let runKm = 0;
      for (let i = 0; i < seg.points.length - 1; i++) {
        const [x1, y1] = seg.points[i];
        const [x2, y2] = seg.points[i + 1];
        runKm += Math.hypot(x2 - x1, y2 - y1) * distanceScale;
      }
      if (runKm <= 0) continue;
      // Same speed calculateRouteDurationDays quotes, so a caravan arrives when it was promised.
      const speed = getWaterSegmentSpeedKmPerDay(seg, month, movement, worldContext);
      cursorKm += runKm;
      legs.push({ endKm: cursorKm, speedKmPerDay: Math.max(speed, 1e-6) });
      continue;
    }

    // Land: per-hop grade-adjusted speeds when cells + heights are available.
    // The paved-surface multiplier is applied to the baked speeds too, so a caravan actually
    // travels at the pace calculateRouteDurationDays quoted it (economy-coupling-audit.md L8-2).
    const surface = getSurfaceSpeedMultiplier(seg.pavedShare);
    if (heights && movement.gradeEffectStrength > 0) {
      const { legs: landLegs } = landTravelLegSpeeds(seg.points, {
        distanceScale,
        heightExponent,
        heights,
        landKmPerDay: movement.landKmPerDay,
        draftSpeedMultiplier: animal.speedMultiplier,
        gradeEffectStrength: movement.gradeEffectStrength,
        sensitivity: animal.gradeSensitivity,
        routePreference: "preferSpeed"
      });
      for (const hop of landLegs) {
        if (hop.runKm <= 0) continue;
        cursorKm += hop.runKm;
        legs.push({ endKm: cursorKm, speedKmPerDay: hop.speedKmPerDay * surface });
      }
    } else {
      let runKm = 0;
      for (let i = 0; i < seg.points.length - 1; i++) {
        const [x1, y1] = seg.points[i];
        const [x2, y2] = seg.points[i + 1];
        runKm += Math.hypot(x2 - x1, y2 - y1) * distanceScale;
      }
      if (runKm <= 0) continue;
      const speed = movement.landKmPerDay * animal.speedMultiplier * surface;
      cursorKm += runKm;
      legs.push({ endKm: cursorKm, speedKmPerDay: Math.max(speed, 1e-6) });
    }
  }

  return legs;
}

/**
 * Walks currentDistance forward by deltaDays along baked (or fallback) planar legs.
 * Each leg consumes the day budget at its own speed so grade slows progress without
 * changing totalDistance (planar km).
 */
function advanceCaravan(
  caravan: Caravan,
  deltaDays: number,
  distanceScale: number,
  month: number,
  movement: CaravanMovementSettings
): void {
  let legs = caravan.travelLegs;
  if (!legs?.length) {
    // Legacy caravans / tests without baked legs: bake once and cache on the instance.
    const world = getWorldContext();
    const heights = world.pack?.cells?.h ?? null;
    legs = bakeCaravanTravelLegs(
      caravan.routeSegments,
      distanceScale,
      caravan.draftAnimalId,
      movement,
      month,
      heights,
      normalizeHeightExponent(optionsStore.getState().heightExponent),
      world
    );
    caravan.travelLegs = legs;
  }
  if (!legs.length) return;

  let remainingDays = deltaDays;
  let legIndex = legs.findIndex(leg => caravan.currentDistance < leg.endKm);
  if (legIndex === -1) legIndex = legs.length - 1;

  while (remainingDays > 0 && legIndex < legs.length) {
    const leg = legs[legIndex];
    const speed = leg.speedKmPerDay;
    if (speed <= 0) break;

    const remainingInLeg = Math.max(0, leg.endKm - caravan.currentDistance);
    const daysToFinish = remainingInLeg / speed;

    if (daysToFinish <= remainingDays) {
      caravan.currentDistance = leg.endKm;
      remainingDays -= daysToFinish;
      legIndex++;
    } else {
      caravan.currentDistance += speed * remainingDays;
      remainingDays = 0;
    }
  }
}

/**
 * Travel legs are the authoritative movement plan after departure. Their measured terminal
 * distance can differ slightly from route geometry used for `totalDistance`, especially on
 * grade-split land legs. Never strand a caravan at 100%/ETA 0 on that rounding difference.
 */
function hasCaravanArrived(caravan: Caravan): boolean {
  const terminalDistance = caravan.travelLegs?.[caravan.travelLegs.length - 1]?.endKm;
  if (terminalDistance !== undefined && terminalDistance > 0) {
    return caravan.currentDistance + ARRIVAL_DISTANCE_EPSILON_KM >= terminalDistance;
  }
  return caravan.currentDistance + ARRIVAL_DISTANCE_EPSILON_KM >= caravan.totalDistance;
}

function resolveBakeContext(month: number): {
  movement: CaravanMovementSettings;
  heights: ArrayLike<number> | null;
  heightExponent: number;
  month: number;
} {
  return {
    movement: CaravanMovement.getOptions(),
    heights: getWorldContext().pack?.cells?.h ?? null,
    heightExponent: normalizeHeightExponent(optionsStore.getState().heightExponent),
    month
  };
}

export class CaravansModule {
  private ensureNextCaravanId(): number {
    // A finished caravan is removed from the live array. Using only that array
    // as the high-water mark reissues its id, and the Trade Animation highlight
    // (keyed on caravan.i) then draws the new shipment as a continuation —
    // a red straight line from the old position to the new destination.
    let liveMax = -1;
    for (const caravan of getCaravans()) {
      if (caravan.i > liveMax) liveMax = caravan.i;
    }
    const stored = getNextCaravanId();
    const next = Math.max(Number.isFinite(stored) ? stored : 0, liveMax + 1, 0);
    if (next !== stored) setNextCaravanId(next);
    return next;
  }

  /** Clears raw fresh cargo from saved/in-memory caravans immediately after a rule or map reload. */
  discardFreshCargo(): void {
    ExportStaging.expireFreshLots(1);
    const remaining: Caravan[] = [];
    for (const caravan of getCaravans()) {
      const changed = discardFreshPayload(caravan);
      if (!changed || caravan.payload.length) {
        remaining.push(caravan);
        continue;
      }
      if (caravan.state === "transit") MerchantTransportAssets.settleCaravan(caravan, "lost");
    }
    setCaravans(remaining);
  }

  /** Applies the current wait and dispatch policy to loading rows restored from a saved map. */
  refreshLoadingPolicies(): void {
    for (const caravan of getCaravans()) refreshLoadingPolicy(caravan);
  }

  /**
   * Creates a state-funded procurement caravan from an already-priced Deal. Unlike
   * generic deal spawning, this path receives the route selected by procurement so
   * a policy order can report `noRoute` instead of silently becoming an unshipped Deal.
   */
  spawnStrategicProcurement(deal: Deal, routeSegments: TradeRouteSegment[]): Caravan | null {
    if (deal.sellerType !== "market" || deal.buyerType !== "market" || deal.strategicProcurementOrderId === undefined) {
      return null;
    }

    const world = getWorldContext();
    const originBurgId = resolveEndpointBurgId(deal.sellerType, deal.seller);
    const destinationBurgId = resolveEndpointBurgId(deal.buyerType, deal.buyer);
    const originBurg = originBurgId !== null ? world.pack.burgs[originBurgId] : undefined;
    const destinationBurg = destinationBurgId !== null ? world.pack.burgs[destinationBurgId] : undefined;
    if (!originBurg || !destinationBurg || !Markets.isDomesticTradePair(originBurg, destinationBurg)) return null;
    const totalDistance = getRouteDistanceKm(routeSegments, world.distanceScale);
    if (totalDistance <= 0) return null;

    const bake = resolveBakeContext(getSimulationMonth());
    const travelLegs = bakeCaravanTravelLegs(
      routeSegments,
      world.distanceScale,
      DEFAULT_DRAFT_ANIMAL_ID,
      bake.movement,
      bake.month,
      bake.heights,
      bake.heightExponent,
      world
    );
    const good = getGoods().find(candidate => candidate.i === deal.good);
    const durationDays = calculateRouteDurationDays(routeSegments, world.distanceScale);
    const routeMaxTemperatureC = getRouteMaxTemperatureC(routeSegments, world.pack.cells?.g, world.grid.cells?.temp);
    const refrigeratedTransport = isTechnologyStageAtLeast(
      getTechnologyStage("mechanicalRefrigeration", originBurg.state ?? 0),
      "adopted"
    );
    if (!good || !isGoodTradePermitted(good, durationDays, routeSegments, routeMaxTemperatureC, refrigeratedTransport))
      return null;
    const slotsPerUnit = good ? getRouteCargoSlotsPerUnit(good, routeSegments) : 0;
    const cargoSlots = deal.units * slotsPerUnit;
    const dispatcherMarketId = MerchantTransportAssets.getDispatcherMarketId(deal);
    if (dispatcherMarketId === null) return null;
    const maxCapacitySlots = MerchantTransportAssets.getLargestAvailableRouteCapacity(
      dispatcherMarketId,
      routeSegments,
      DEFAULT_DRAFT_ANIMAL_ID
    );
    if (cargoSlots > maxCapacitySlots) return null;
    // A drove walks: no cart to book.
    const transportAllocations =
      cargoSlots > UNIT_EPSILON || routeHasWater(routeSegments)
        ? getTransportAllocations(routeSegments, cargoSlots, DEFAULT_DRAFT_ANIMAL_ID, true)
        : [];
    for (const allocation of transportAllocations) allocation.usedSlots = cargoSlots;

    const caravanId = this.ensureNextCaravanId();
    const itinerary = reservationItinerary(deal, routeSegments);
    const reservation = MerchantTransportAssets.reserve(dispatcherMarketId, caravanId, transportAllocations, itinerary);
    if (!canDepartWithTransportAssets(transportAllocations, reservation, routeSegments)) return null;

    const caravan: Caravan = {
      i: caravanId,
      seller: deal.seller,
      sellerType: deal.sellerType,
      buyer: deal.buyer,
      buyerType: deal.buyerType,
      payload: [
        {
          goodId: deal.good,
          dealId: deal.i,
          units: deal.units,
          value: deal.price * deal.units,
          cargoSlotsPerUnit: good ? slotsPerUnit : undefined,
          strategicProcurementOrderId: deal.strategicProcurementOrderId
        }
      ],
      units: rn(deal.units, 2),
      value: rn(deal.price * deal.units, 2),
      merchantOrganizationId: resolveMerchantOrganizationId(dispatcherMarketId),
      draftAnimalId: DEFAULT_DRAFT_ANIMAL_ID,
      transportAllocations: reservation?.reservation.allocations ?? transportAllocations,
      transportReservationId: reservation?.reservation.id,
      transportDispatcherMarketId: reservation?.dispatcherMarketId,
      routeSegments,
      totalDistance,
      currentDistance: 0,
      travelLegs,
      state: "transit"
    };

    getCaravans().push(caravan);
    recordRouteTraffic(routeSegments);
    recordCaravanCorridor(caravan);
    recordSeaDeparture(caravan, reservation?.dispatcherMarketId ?? dispatcherMarketId);
    getCargoDepartureObserver()?.(caravan);
    if (reservation) MerchantTransportAssets.depart(reservation.reservation.id);
    setNextCaravanId(caravan.i + 1);
    deal.remainingUnits = 0;
    deal.spawned = true;
    return caravan;
  }

  /**
   * Bundles deals sharing an exporter/importer pair — the unit a caravan/route is planned
   * against. Shared by spawnFromDeals() and spawnFromDealsIncrementally() so both loop over
   * the exact same bundles, either synchronously or in yielded batches.
   */
  private buildDealBundles(deals: Deal[]): RouteBundle[] {
    type RouteKey = `${number}-${string}-${number}-${string}`;
    const bundles = new Map<RouteKey, RouteBundle>();

    const addToBundle = (deal: Deal): void => {
      if ((deal.remainingUnits ?? deal.units) <= UNIT_EPSILON || deal.spawned) return;
      const key: RouteKey = `${deal.seller}-${deal.sellerType}-${deal.buyer}-${deal.buyerType}`;
      let bundle = bundles.get(key);
      if (!bundle) {
        bundle = {
          seller: deal.seller,
          sellerType: deal.sellerType,
          buyer: deal.buyer,
          buyerType: deal.buyerType,
          deals: []
        };
        bundles.set(key, bundle);
      }
      bundle.deals.push(deal);
    };

    // Phase C: market↔market physical cargo lives in the export warehouse, not only on deals.
    for (const deal of stagingLotsToDeals(getExportStagingLots())) addToBundle(deal);

    // Local aggregation still uses ephemeral deals (no warehouse).
    for (const deal of deals) {
      if (deal.sellerType === "market" && deal.buyerType === "market") continue;
      addToBundle(deal);
    }

    return Array.from(bundles.values());
  }

  /**
   * Plans and spawns every `loading` caravan for one route bundle (pathfinding, cargo manifest,
   * fleet-capacity loop). Returns the next unused caravan id, threaded through the caller's
   * per-map counter across bundles — see spawnFromDeals()'s nextId comment.
   */
  private spawnCaravansForBundle(bundle: RouteBundle, world: WorldContext, nextId: number): number {
    const observe = bundle.sellerType === "market" && bundle.buyerType === "market" ? getLotDispatchObserver() : null;
    if (!observe) return this.planBundleCaravans(bundle, world, nextId).nextId;

    // R0 diagnostics (docs/plan/long-distance-merchant-reach-capital.md §5.3): what became of each lot.
    const unitsBefore = new Map<number, number>();
    for (const deal of bundle.deals) {
      if (deal.stagingLotId !== undefined) unitsBefore.set(deal.stagingLotId, deal.remainingUnits ?? deal.units);
    }
    const result = this.planBundleCaravans(bundle, world, nextId);
    const lots = new Map(getExportStagingLots().map(lot => [lot.id, lot]));
    for (const [lotId, before] of unitsBefore) {
      const lot = lots.get(lotId);
      const units = lot?.units ?? 0;
      const outcome: LotDispatchOutcome =
        units + UNIT_EPSILON < before
          ? "loaded"
          : result.eligibleLotIds && !result.eligibleLotIds.has(lotId)
            ? "shipmentRule"
            : result.outcome;
      observe({
        lotId,
        exporterId: bundle.seller,
        importerId: bundle.buyer,
        goodId: lot?.goodId ?? bundle.deals.find(deal => deal.stagingLotId === lotId)?.good ?? -1,
        outcome,
        units,
        lockedCapital: lot?.lockedCapital ?? 0,
        durationDays: lot?.durationDays
      });
    }
    return result.nextId;
  }

  private planBundleCaravans(
    bundle: RouteBundle,
    world: WorldContext,
    nextId: number
  ): { nextId: number; outcome: LotDispatchOutcome; eligibleLotIds?: Set<number> } {
    const burgs = world.pack.burgs;
    if (!burgs) return { nextId, outcome: "noEndpoint" };

    let startBurgId: number;
    if (bundle.sellerType === "market") {
      const m = getMarketById(bundle.seller);
      if (!m) return { nextId, outcome: "noEndpoint" };
      startBurgId = m.centerBurgId;
    } else {
      startBurgId = bundle.seller;
    }

    let endBurgId: number;
    if (bundle.buyerType === "market") {
      const m = getMarketById(bundle.buyer);
      if (!m) return { nextId, outcome: "noEndpoint" };
      endBurgId = m.centerBurgId;
    } else {
      endBurgId = bundle.buyer;
    }

    const startBurg = burgs[startBurgId];
    const endBurg = burgs[endBurgId];

    if (!startBurg || !endBurg || startBurg.i === endBurg.i) return { nextId, outcome: "noEndpoint" };
    if (!Markets.isDomesticTradePair(startBurg, endBurg)) return { nextId, outcome: "notDomestic" };

    const routePath = TradeRoutePlanner.findRoutePath(startBurg.cell, endBurg.cell);
    // Trade matching books a pair with no road between them on a cross-country track, as pack
    // trains went where no road ran; the shipment takes the same track rather than waiting for a
    // road that never comes (port-freight-queue-and-warehouses.md §10.11).
    const crossCountry = !routePath?.segments.length && !Markets.usesStateBoundedTerritories();
    if (!routePath?.segments.length && !crossCountry) return { nextId, outcome: "noRoute" };

    const routeSegments: TradeRouteSegment[] = routePath?.segments.length
      ? routePath.segments.map(segment => ({
          type: segment.type,
          // Preserve cell ids for grade-aware duration (Phase 1).
          points: segment.points.map(toTradeRoutePoint),
          // Paved share of this leg at planning time — Public Works road promotions make the same
          // journey faster (docs/plan/economy-coupling-audit.md L8 stage 2).
          pavedShare: segment.pavedShare
        }))
      : [
          {
            type: "land",
            points: [
              [startBurg.x, startBurg.y, startBurg.cell],
              [endBurg.x, endBurg.y, endBurg.cell]
            ]
          }
        ];
    const distance = getRouteDistanceKm(routeSegments, world.distanceScale);
    if (distance <= 0) return { nextId, outcome: "noRoute" };

    const durationDays = calculateRouteDurationDays(routeSegments, world.distanceScale);
    const maintenanceCost = getCaravanMaintenanceCost(durationDays);
    const logistics = TradeLogisticsSettings.getOptions();
    const maxLoadingWaitDays = maxWaitDaysForRoute(routeSegments, distance, {
      maxWaitDaysLand: logistics.maxWaitDaysLand,
      maxWaitDaysSea: logistics.maxWaitDaysSea,
      maxWaitDaysShortSea: logistics.maxWaitDaysShortSea,
      shortSeaDistanceKm: logistics.shortSeaDistanceKm
    });
    const refrigeratedTransport = isTechnologyStageAtLeast(
      getTechnologyStage("mechanicalRefrigeration", startBurg.state ?? 0),
      "adopted"
    );
    const transportedDeals = selectRouteCargo(
      bundle.deals,
      getGoods(),
      durationDays,
      maxLoadingWaitDays,
      maintenanceCost,
      routeSegments,
      refrigeratedTransport
    );
    const eligibleLotIds = new Set(
      transportedDeals.map(deal => deal.stagingLotId).filter((id): id is number => id !== undefined)
    );
    if (!transportedDeals.length) return { nextId, outcome: "shipmentRule", eligibleLotIds };

    const dispatcherMarketId = MerchantTransportAssets.getDispatcherMarketId(bundle);
    if (dispatcherMarketId === null) return { nextId, outcome: "noDispatcher", eligibleLotIds };

    const portTransfer = planPortTransfer(routeSegments, world.distanceScale);
    const startsAtPort = Boolean(portTransfer?.atPort);
    // Pack the ship first; the road beyond the sea can use several carts, as after an inland transfer.
    const packingSegments = startsAtPort
      ? routeSegments.filter(segment => segment.type === "sea" || segment.type === "water")
      : routeSegments;

    // Commercial shipments accumulate in `loading` without reserving fleet assets. Assets are
    // reserved only at departure so a half-empty hold does not lock a cart or hull for weeks.
    let outcome: LotDispatchOutcome = "notPacked";
    while (true) {
      const maxCapacitySlots = MerchantTransportAssets.getLargestAvailableRouteCapacity(
        dispatcherMarketId,
        packingSegments,
        DEFAULT_DRAFT_ANIMAL_ID,
        { awaitVessel: true }
      );
      if (maxCapacitySlots === 0) {
        outcome = "noTransport";
        markAwaitingTransport(transportedDeals);
        // A river leg with no barge free: ask for one to be built for this cargo (§10).
        if (
          routeSegments.some(segment => segment.type === "river") &&
          !MerchantTransportAssets.getAvailability(dispatcherMarketId).some(
            asset => asset.assetId === "river-barge" && asset.available > 0
          )
        ) {
          const goodById = new Map(getGoods().map(good => [good.i, good]));
          const slots = transportedDeals.reduce((sum, deal) => {
            const good = goodById.get(deal.good);
            return sum + (good ? (deal.remainingUnits ?? deal.units) * getGoodCargoSlotsPerUnit(good) : 0);
          }, 0);
          MerchantTransportAssets.recordRiverBargeShortfall(dispatcherMarketId, slots);
        }
        break;
      }

      // Prefer topping up an existing loading caravan on the same O/D before opening a new one.
      const existingLoading = getCaravans().find(
        caravan => caravan.state === "loading" && isAtPort(caravan) === startsAtPort && sameRouteBundle(caravan, bundle)
      );
      if (existingLoading?.loading) {
        const freeSlots = existingLoading.loading.plannedCapacitySlots - payloadUsedSlots(existingLoading);
        // A sub-berth remainder is not worth a top-up; it leaves the hold to depart as loaded.
        if (freeSlots >= MINIMUM_CARGO_SLOTS) {
          const [topUp] = buildCargoManifests(
            transportedDeals,
            getGoods(),
            packingSegments,
            DEFAULT_DRAFT_ANIMAL_ID,
            freeSlots,
            1
          );
          if (topUp?.items.length) {
            const addedSlots = appendPayloadFromManifest(existingLoading, topUp);
            // A rejected/stale manifest must not re-enter this branch with exactly the same
            // deals. Without this progress guard, generation can spin forever on one O/D pair.
            if (addedSlots <= UNIT_EPSILON) break;
            if (existingLoading.transportAllocations) {
              for (const allocation of existingLoading.transportAllocations) {
                allocation.usedSlots = payloadUsedSlots(existingLoading);
              }
            }
            tryDepartLoadingCaravan(existingLoading);
            continue;
          }
        }
      }

      const [manifest] = buildCargoManifests(
        transportedDeals,
        getGoods(),
        packingSegments,
        DEFAULT_DRAFT_ANIMAL_ID,
        maxCapacitySlots,
        1
      );
      if (!manifest?.items.length) break;

      // The manifest has already selected the smallest suitable vehicle. Using the fleet's
      // largest capacity here made a small cart load wait for a wagon-sized hold.
      const plannedCapacitySlots = getManifestCapacitySlots(manifest.allocations);

      const bake = resolveBakeContext(getSimulationMonth());
      const travelLegs = bakeCaravanTravelLegs(
        routeSegments,
        world.distanceScale,
        DEFAULT_DRAFT_ANIMAL_ID,
        bake.movement,
        bake.month,
        bake.heights,
        bake.heightExponent,
        world
      );

      const dayOfMonth = getSimulationDay();
      const caravan: Caravan = {
        i: nextId++,
        seller: bundle.seller,
        sellerType: bundle.sellerType,
        buyer: bundle.buyer,
        buyerType: bundle.buyerType,
        payload: [],
        units: 0,
        value: 0,
        merchantOrganizationId: resolveMerchantOrganizationId(dispatcherMarketId),
        draftAnimalId: DEFAULT_DRAFT_ANIMAL_ID,
        // Planned abstract allocations for UI; real assets attach at depart.
        transportAllocations: manifest.allocations.map(allocation => ({
          ...allocation,
          usedSlots: manifest.usedSlots
        })),
        transportDispatcherMarketId: dispatcherMarketId,
        routeSegments,
        totalDistance: distance,
        currentDistance: 0,
        travelLegs,
        state: "loading",
        departReason: "waiting",
        portTransfer: portTransfer ? { ...portTransfer } : undefined,
        loading: {
          waitedDays: 0,
          maxWaitDays: maxLoadingWaitDays,
          targetUtilization: logistics.targetUtilization,
          minSailUtilization: logistics.minSailUtilization,
          plannedCapacitySlots,
          sailScheduleDays: [...logistics.sailDays],
          nextSailDay: nextScheduledSailDay(dayOfMonth, logistics.sailDays)
        }
      };
      if (startsAtPort && caravan.loading) caravan.loading.plannedCapacitySlots = portHoldSlots(caravan, routeSegments);
      refreshLoadingPolicy(caravan);
      const addedSlots = appendPayloadFromManifest(caravan, manifest);
      if (addedSlots <= UNIT_EPSILON || !caravan.payload.length) break;
      getCaravans().push(caravan);

      // Immediate depart when the first load already meets the fill target (common for large deals),
      // unless older cargo of the house waits at the landing for a barge: it goes first.
      if (!waitsBehindAtLanding(caravan)) tryDepartLoadingCaravan(caravan);
    }

    return { nextId, outcome, eligibleLotIds };
  }

  /**
   * Loads commercial cargo into `loading` caravans.
   * Market↔market cargo is taken from the export warehouse (staging lots), which survives
   * production-cycle deal wipes. Burg↔market deals still come from the deals array.
   */
  spawnFromDeals(deals: Deal[]) {
    const world = getWorldContext();
    // tick() below filters arrived/lost caravans out of the caravans slice, so deriving
    // nextId from Math.max over that live array would eventually reuse a completed caravan's
    // id. The SVG renderer's d3 join is keyed on caravan.i, and a reused id makes it treat an
    // unrelated new caravan as a continuation of the old one, animating a huge jump between
    // their positions. A counter stored independently of the filtered array keeps ids unique
    // for the map's lifetime.
    let nextId = this.ensureNextCaravanId();

    if (!world.pack.burgs) return;

    for (const bundle of this.buildDealBundles(deals)) {
      nextId = this.spawnCaravansForBundle(bundle, world, nextId);
    }

    setNextCaravanId(nextId);
  }

  /**
   * Same bundling + per-bundle spawn as spawnFromDeals() (identical output — both call
   * buildDealBundles()/spawnCaravansForBundle()), but yields to the browser between bundles so
   * a newly generated map's initial caravan spawn doesn't block the main thread for its whole
   * cost in one block. Used only by the "Preparing economy" Map Ready task (economy/index.tsx)
   * — every other caller keeps using the synchronous spawnFromDeals(). Returns false if
   * cancelled before completion.
   */
  async spawnFromDealsIncrementally(deals: Deal[], options: IncrementalBatchOptions = {}): Promise<boolean> {
    const world = getWorldContext();
    let nextId = this.ensureNextCaravanId();

    if (!world.pack.burgs) return true;

    const bundles = this.buildDealBundles(deals);
    const completed = await runBatchedYielding(
      bundles,
      bundle => {
        nextId = this.spawnCaravansForBundle(bundle, world, nextId);
      },
      options
    );

    setNextCaravanId(nextId);
    return completed;
  }

  /**
   * Loads the warehouse lots the last pass left for want of a free cart, barge or hull, as soon as
   * the dispatching market has one again. Carts come home through the month, and cargo waiting for
   * them went with the first one back rather than at the next production cycle
   * (port-freight-queue-and-warehouses.md §10.24).
   */
  private retryLotsAwaitingTransport(world: WorldContext): void {
    if (!world.pack.burgs) return;
    const waiting = getExportStagingLots().filter(lot => lot.awaitingTransport && lot.units > UNIT_EPSILON);
    if (!waiting.length) return;
    const ready = new Map<number, boolean>();
    const hasFreeTransport = (marketId: number): boolean => {
      let free = ready.get(marketId);
      if (free === undefined) {
        free =
          MerchantTransportAssets.getLargestAvailableLandCapacity(marketId, DEFAULT_DRAFT_ANIMAL_ID) > 0 ||
          MerchantTransportAssets.getAvailability(marketId).some(
            asset => asset.assetId === "river-barge" && asset.available > 0
          );
        ready.set(marketId, free);
      }
      return free;
    };
    const lots = waiting.filter(lot => hasFreeTransport(lot.marketId));
    if (!lots.length) return;
    const bundles = new Map<string, RouteBundle>();
    for (const deal of stagingLotsToDeals(lots)) {
      const key = `${deal.seller}-${deal.buyer}`;
      let bundle = bundles.get(key);
      if (!bundle) {
        bundle = { seller: deal.seller, sellerType: "market", buyer: deal.buyer, buyerType: "market", deals: [] };
        bundles.set(key, bundle);
      }
      bundle.deals.push(deal);
    }
    for (const lot of lots) lot.awaitingTransport = undefined;
    let nextId = this.ensureNextCaravanId();
    for (const bundle of bundles.values()) nextId = this.spawnCaravansForBundle(bundle, world, nextId);
    setNextCaravanId(nextId);
  }

  tick(deltaDays: number): CaravanTickResult {
    const world = getWorldContext();
    const markets = getMarkets();
    decayCaravanArrivalVolume(markets, deltaDays);
    MerchantTransportAssets.recoverMaintenance(deltaDays);
    repositionIdleHulls();
    accruePortStorage(deltaDays);
    ExportStaging.expireFreshLots(deltaDays);
    ExportStaging.cancelStaleLots(deltaDays);
    this.retryLotsAwaitingTransport(world);

    const caravans = getCaravans();
    if (!caravans.length) return { arrived: [], lost: [] };

    const movement = CaravanMovement.getOptions();
    const month = getSimulationMonth();
    const arrived: Caravan[] = [];
    const lost: Caravan[] = [];

    // Advance accumulation clocks and attempt scheduled / full-enough departures. Sea cargo goes
    // last and dearest first: a ship's master loaded the precious goods before the bulk, and the
    // bulk waited for the next ship (port-freight-queue-and-warehouses.md §4.3).
    for (const caravan of loadingOrder(caravans)) {
      if (caravan.state !== "loading" || !caravan.loading) continue;
      const cargoSpoiled = discardFreshPayload(caravan);
      if (cargoSpoiled && !caravan.payload.length) {
        caravan.state = "lost";
        lost.push(caravan);
        continue;
      }
      if (caravan.transportAllocations) {
        for (const allocation of caravan.transportAllocations) allocation.usedSlots = payloadUsedSlots(caravan);
      }
      refreshLoadingPolicy(caravan);
      // A port laid up for winter or iced in holds its sea cargo, and the wait does not count
      // against it: the house stored its goods for the first sailing (§10.27).
      if (isLaidUp(caravan)) {
        caravan.departReason = "waiting";
        continue;
      }
      caravan.loading.waitedDays += deltaDays;
      const outcome = tryDepartLoadingCaravan(caravan);
      if (outcome === "cancelled") lost.push(caravan);
    }

    for (const caravan of caravans) {
      if (caravan.state !== "transit") continue;

      const cargoSpoiled = discardFreshPayload(caravan);
      if (cargoSpoiled && !caravan.payload.length) {
        caravan.state = "lost";
        MerchantTransportAssets.settleCaravan(caravan, "lost");
        lost.push(caravan);
        continue;
      }

      advanceCaravan(caravan, deltaDays, world.distanceScale, month, movement);

      const buyerMarket =
        caravan.buyerType === "market"
          ? markets.find(market => market.i === caravan.buyer)
          : markets.find(market => market.centerBurgId === caravan.buyer);
      const destinationBurgId = buyerMarket?.centerBurgId ?? (caravan.buyerType === "burg" ? caravan.buyer : 0);
      const warIntensity = getBurgMarketLedger(destinationBurgId)?.warIntensity ?? 0;
      const banditRiskPerDay = TradeSecurity.getBanditRiskPerDay(destinationBurgId, warIntensity);

      if (banditRiskPerDay > 0) {
        const risk = banditRiskPerDay * deltaDays;
        if (Math.random() < risk) {
          caravan.state = "lost";
          MerchantTransportAssets.settleCaravan(caravan, "raided");
          settlePayloadCapital(caravan, "lost");
          settleFoodCoLoadOnLoss(caravan);
          lost.push(caravan);
          const destinationStateId = world.pack.burgs[destinationBurgId]?.state ?? 0;
          TradeSecurity.recordCaravanLoss(destinationStateId);
          continue;
        }
      }

      // The inland stage sets its cargo down in the port warehouse (§10.19).
      const transfer = caravan.portTransfer;
      if (transfer && !transfer.atPort && caravan.currentDistance + ARRIVAL_DISTANCE_EPSILON_KM >= transfer.atKm) {
        setDownAtPort(caravan);
        continue;
      }

      if (hasCaravanArrived(caravan)) {
        // Keep detail/render progress coherent until this terminal row is removed below.
        caravan.currentDistance = Math.max(caravan.currentDistance, caravan.totalDistance);
        caravan.state = "arrived";
        // The house now has an agent at the destination: its prices start reaching home.
        const house = getMerchantOrganizations().find(entry => entry.i === caravan.merchantOrganizationId);
        if (house && caravan.buyerType === "market") openBranch(house.homeMarketId, caravan.buyer);
        MerchantTransportAssets.settleCaravan(caravan, "arrived");
        TransportAssetOrders.sellArrivedVehicles(caravan);
        settlePayloadCapital(caravan, "arrived");
        settleFoodCoLoadOnArrival(caravan, world.distanceScale);

        // Add ordinary (non-food-co-load) goods to target market retail stock
        if (caravan.buyerType === "market") {
          const buyerMarket = markets.find(market => market.i === caravan.buyer);
          if (buyerMarket) {
            let stockChanged = false;
            for (const item of caravan.payload) {
              if (item.isFoodCoLoad) continue;
              const good = buyerMarket.goods[item.goodId];
              if (good) {
                good.stock = rn(good.stock + item.units, 2);
                const goodDefinition = getGoods().find(candidate => candidate.i === item.goodId);
                if (goodDefinition) recordFoodDeliveredExport(buyerMarket, goodDefinition.name, item.units);
                recordGoodFlow({
                  direction: "source",
                  category: "importArrival",
                  livestockCargoIds: item.livestockCargoIds,
                  goodId: item.goodId,
                  units: item.units,
                  marketId: buyerMarket.i
                });
                stockChanged = true;
              } else discardLivestockCargo(item.livestockCargoIds, Infinity, "missingDestinationStock");
            }
            // Market.goods stock moved; daily retail tick re-layouts only this market.
            if (stockChanged) markRetailInventoryDirty(buyerMarket.i);
          }
        }

        // Cargo needs handlers to unload/reload regardless of buyer type — feeds the "trade"
        // LaborMarket occupation's demand (docs/plan/urban-employment-demand.md §3.3/§5.1-6).
        const deliveryMarketId =
          caravan.buyerType === "market" ? caravan.buyer : world.pack.burgs[caravan.buyer]?.market;
        const deliveryMarket = deliveryMarketId ? markets.find(market => market.i === deliveryMarketId) : undefined;
        if (deliveryMarket) {
          deliveryMarket.caravanArrivalVolume = rn((deliveryMarket.caravanArrivalVolume ?? 0) + caravan.units, 2);
        }

        if (caravan.buyerType !== "market" || !markets.some(market => market.i === caravan.buyer)) {
          for (const item of caravan.payload)
            discardLivestockCargo(item.livestockCargoIds, Infinity, "untrackedRecipient");
        }
        arrived.push(caravan);
      }
    }

    // Keep loading + transit; drop terminal arrived/lost (including cancelled thin loads).
    setCaravans(caravans.filter(c => c.state === "loading" || c.state === "transit"));
    // Project remaining transit/loading progress onto bound Shipbuilding hulls.
    publishCaravanHullPositions(getCaravans());
    return { arrived, lost };
  }
}

/**
 * Decides which of a route's bundled deals become one caravan's cargo. `maintenanceCost` is a
 * one-time cost for the whole trip, not per deal: as long as the bundle's combined cargo can
 * cover it once, every eligible deal on that route rides along together — a high-value deal can
 * fund the trip while low-value deals that could never justify a dedicated caravan alone travel
 * as "filler" cargo. A bundle is always homogeneous in seller/buyer type (see the `bundles` map
 * key above), so it never mixes market↔market deals with burg↔market deals.
 */
function selectRouteCargo(
  deals: Deal[],
  goods: Good[],
  durationDays: number,
  maxLoadingWaitDays: number,
  maintenanceCost: number,
  routeSegments: readonly TradeRouteSegment[],
  refrigeratedTransport?: boolean
): Deal[] {
  const world = getWorldContext();
  const routeMaxTemperatureC = getRouteMaxTemperatureC(routeSegments, world.pack.cells?.g, world.grid.cells?.temp);
  // Good ids start at 1: look goods up by id, not by position in the catalogue.
  const goodById = new Map(goods.map(good => [good.i, good]));
  const eligible = deals.filter(deal => {
    const good = goodById.get(deal.good);
    return Boolean(
      good &&
        isGoodTradePermittedForShipment(
          good,
          durationDays,
          maxLoadingWaitDays,
          routeSegments,
          routeMaxTemperatureC,
          refrigeratedTransport
        )
    );
  });
  if (!eligible.length) return [];

  // Market-to-market deals have already passed the full route-level profit check in
  // Markets.runGlobalTrade (including this same shared-maintenanceCost bundling), so trust them.
  if (eligible[0].sellerType === "market" && eligible[0].buyerType === "market") return eligible;

  // Burg↔market deals represent local market aggregation and retain no margin of their own, so
  // use the bundle's combined cargo value as a conservative upper bound: the trip only happens
  // if that combined value can cover the route's fixed cost once.
  const combinedValue = eligible.reduce((sum, deal) => sum + deal.price * deal.units, 0);
  return combinedValue - maintenanceCost >= MIN_TRADE_PROFIT ? eligible : [];
}

export const Caravans = new CaravansModule();
