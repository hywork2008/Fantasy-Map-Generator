import { landTravelLegSpeeds } from "../../../services/routeGrade";
import { normalizeHeightExponent } from "../../../utils/height";
import { useOptionsState } from "../../hostCore";
import { rn } from "../../hostUtils";
import {
  getCaravans,
  getDeals,
  getExportStagingLots,
  getGoods,
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
  getDraftAnimalType,
  getSeaConditionMultiplier
} from "./caravanMovement";
import { ExportStaging } from "./exportStaging";
import {
  restoreFoodCoLoadToOrigin,
  settleFoodCoLoadOnArrival,
  settleFoodCoLoadOnLoss,
  tryCoLoadFoodOntoCaravan
} from "./foodCoLoad";
import type { Good } from "./goods-generator";
import { utilizationOf } from "./marketFlowBudget";
import type { Caravan, Deal, ExportStagingLot, Market, TradeRouteSegment } from "./marketTypes";
import { MerchantTradeCapital } from "./merchantTradeCapital";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import {
  buildCargoManifests,
  getGoodCargoSlotsPerUnit,
  getManifestCapacitySlots,
  getTransportAllocations
} from "./tradeCargo";
import { TradeLogisticsSettings } from "./tradeLogisticsSettings";
import {
  getCaravanMaintenanceCost,
  getRouteMaxTemperatureC,
  isGoodTradePermitted,
  MIN_TRADE_PROFIT
} from "./tradeOpportunityEstimator";
import { calculateRouteDurationDays, getRouteDistanceKm } from "./tradeRouteDuration";
import { TradeRoutePlanner } from "./tradeRoutePlanner";
import {
  decideSailDeparture,
  maxWaitDaysForRoute,
  nextScheduledSailDay,
  sailDecisionFromReason
} from "./tradeSailSchedule";
import { TradeSecurity } from "./tradeSecurity";

export type CaravanTravelLeg = { endKm: number; speedKmPerDay: number };

/** Halves a market's tracked `caravanArrivalVolume` roughly every two months of no new arrivals. */
const CARAVAN_VOLUME_HALF_LIFE_DAYS = 60;
const CARAVAN_VOLUME_DECAY_RATE = Math.LN2 / CARAVAN_VOLUME_HALF_LIFE_DAYS;
const UNIT_EPSILON = 0.000001;

function payloadUsedSlots(caravan: Pick<Caravan, "payload">): number {
  return caravan.payload.reduce((sum, item) => {
    const slotsPerUnit = item.cargoSlotsPerUnit ?? 1;
    return sum + item.units * slotsPerUnit;
  }, 0);
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
): void {
  let totalUnits = caravan.units;
  let totalValue = caravan.value;
  for (const item of manifest.items) {
    let units = item.units;
    let lockedCapital = 0;
    // Prefer export-warehouse take when the deal (or pseudo-deal) is backed by a staging lot.
    if (item.deal.stagingLotId !== undefined) {
      const taken = ExportStaging.takeFromLot(item.deal.stagingLotId, item.units);
      units = taken.units;
      lockedCapital = taken.lockedCapital;
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
    const existing = caravan.payload.find(
      entry =>
        entry.dealId === item.deal.i && entry.goodId === item.deal.good && entry.stagingLotId === item.deal.stagingLotId
    );
    if (existing) {
      existing.units += units;
      existing.value += value;
      existing.lockedCapital = (existing.lockedCapital ?? 0) + lockedCapital;
    } else {
      caravan.payload.push({
        goodId: item.deal.good,
        dealId: item.deal.i,
        units,
        value,
        cargoSlotsPerUnit: item.cargoSlotsPerUnit,
        strategicProcurementOrderId: item.deal.strategicProcurementOrderId,
        stagingLotId: item.deal.stagingLotId,
        lockedCapital: lockedCapital > UNIT_EPSILON ? lockedCapital : undefined
      });
    }
  }
  caravan.units = rn(totalUnits, 2);
  caravan.value = rn(totalValue, 2);
}

/** Return loading cargo to the exporter market retail stock when a thin hold is cancelled. */
function restoreLoadingCargoToOrigin(caravan: Caravan): void {
  if (caravan.sellerType !== "market") return;
  restoreFoodCoLoadToOrigin(caravan);
  for (const item of caravan.payload) {
    if (item.isFoodCoLoad) continue;
    ExportStaging.returnUnitsToRetail(caravan.seller, item.goodId, item.units);
    if ((item.lockedCapital ?? 0) > UNIT_EPSILON) {
      MerchantTradeCapital.unlock(caravan.seller, item.lockedCapital ?? 0);
    }
  }
}

function settlePayloadCapital(caravan: Caravan, outcome: "arrived" | "lost"): void {
  if (caravan.sellerType !== "market") return;
  for (const item of caravan.payload) {
    if (item.isFoodCoLoad) continue;
    const locked = item.lockedCapital ?? 0;
    if (!(locked > UNIT_EPSILON)) continue;
    if (outcome === "arrived") MerchantTradeCapital.settleArrival(caravan.seller, locked);
    else MerchantTradeCapital.settleLoss(caravan.seller, locked);
  }
}

/** Staging lots → deal-shaped rows so buildCargoManifests can pack them. */
function stagingLotsToDeals(lots: readonly ExportStagingLot[]): Deal[] {
  const liveDeals = getDeals();
  return lots
    .filter(lot => lot.units > UNIT_EPSILON)
    .map(lot => {
      const linked = lot.dealId !== undefined ? liveDeals.find(deal => deal.i === lot.dealId) : undefined;
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

function tryDepartLoadingCaravan(caravan: Caravan): "departed" | "waiting" | "cancelled" {
  if (caravan.state !== "loading" || !caravan.loading) return "waiting";

  // Co-load staple food into free space first so it counts toward sail utilization
  // (historical ballast / bulk grain riding with higher-value general cargo).
  tryCoLoadFoodOntoCaravan(caravan, { distanceScale: getWorldContext().distanceScale });

  const usedSlots = payloadUsedSlots(caravan);
  const planned = caravan.loading.plannedCapacitySlots;
  const util = utilizationOf(usedSlots, planned);
  const dayOfMonth = getSimulationDay();
  const logistics = TradeLogisticsSettings.getOptions();
  const sailDays = caravan.loading.sailScheduleDays?.length ? caravan.loading.sailScheduleDays : logistics.sailDays;
  caravan.loading.nextSailDay = nextScheduledSailDay(dayOfMonth, sailDays);
  caravan.loading.sailScheduleDays = [...sailDays];

  const reason = decideSailDeparture({
    utilization: util,
    targetUtilization: caravan.loading.targetUtilization,
    minSailUtilization: caravan.loading.minSailUtilization,
    waitedDays: caravan.loading.waitedDays,
    maxWaitDays: caravan.loading.maxWaitDays,
    dayOfMonth,
    sailDays,
    unitEpsilon: UNIT_EPSILON
  });
  const decision = sailDecisionFromReason(reason);
  caravan.departReason = reason === "waiting" ? "waiting" : reason;

  if (decision === "waiting") return "waiting";
  if (decision === "cancelled") {
    restoreLoadingCargoToOrigin(caravan);
    caravan.state = "lost";
    return "cancelled";
  }

  // Right-size the vehicle to the actual cargo, then reserve durable assets at sail time only.
  const allocations = getTransportAllocations(
    caravan.routeSegments,
    Math.max(usedSlots, UNIT_EPSILON),
    caravan.draftAnimalId
  );
  for (const allocation of allocations) allocation.usedSlots = usedSlots;
  const capacitySlots = getManifestCapacitySlots(allocations);
  if (capacitySlots <= 0 || usedSlots > capacitySlots + UNIT_EPSILON) return "waiting";

  const dispatcherMarketId =
    caravan.transportDispatcherMarketId ?? MerchantTransportAssets.getDispatcherMarketId(caravan);
  if (dispatcherMarketId === null) return "waiting";

  const reservation = MerchantTransportAssets.reserve(dispatcherMarketId, caravan.i, allocations);
  const hasLandTransport = allocations.some(allocation => allocation.mode === "land");
  if (hasLandTransport && !reservation) return "waiting";

  caravan.transportAllocations = reservation?.reservation.allocations ?? allocations;
  caravan.transportReservationId = reservation?.reservation.id;
  caravan.transportDispatcherMarketId = reservation?.dispatcherMarketId ?? dispatcherMarketId;
  caravan.merchantOrganizationId ??= resolveMerchantOrganizationId(dispatcherMarketId);
  caravan.state = "transit";
  caravan.loading = undefined;
  if (reservation) MerchantTransportAssets.depart(reservation.reservation.id);
  return "departed";
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

function toXy(point: readonly number[]): [number, number] {
  return [point[0], point[1]];
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
 */
export function bakeCaravanTravelLegs(
  segments: readonly TradeRouteSegment[],
  distanceScale: number,
  draftAnimalId: string,
  movement: CaravanMovementSettings,
  month: number,
  heights: ArrayLike<number> | null,
  heightExponent: number
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
      const from = toXy(seg.points[0]);
      const to = toXy(seg.points[seg.points.length - 1]);
      const currentMultiplier =
        seg.type === "river" ? 1 : getSeaConditionMultiplier(from, to, month, movement.seaCurrentStrength);
      const speed = (seg.type === "river" ? movement.riverKmPerDay : movement.seaKmPerDay) * currentMultiplier;
      cursorKm += runKm;
      legs.push({ endKm: cursorKm, speedKmPerDay: Math.max(speed, 1e-6) });
      continue;
    }

    // Land: per-hop grade-adjusted speeds when cells + heights are available.
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
        legs.push({ endKm: cursorKm, speedKmPerDay: hop.speedKmPerDay });
      }
    } else {
      let runKm = 0;
      for (let i = 0; i < seg.points.length - 1; i++) {
        const [x1, y1] = seg.points[i];
        const [x2, y2] = seg.points[i + 1];
        runKm += Math.hypot(x2 - x1, y2 - y1) * distanceScale;
      }
      if (runKm <= 0) continue;
      const speed = movement.landKmPerDay * animal.speedMultiplier;
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
    const heights = getWorldContext().pack?.cells?.h ?? null;
    legs = bakeCaravanTravelLegs(
      caravan.routeSegments,
      distanceScale,
      caravan.draftAnimalId,
      movement,
      month,
      heights,
      normalizeHeightExponent(useOptionsState.getState().heightExponent)
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

function resolveBakeContext(month: number): {
  movement: CaravanMovementSettings;
  heights: ArrayLike<number> | null;
  heightExponent: number;
  month: number;
} {
  return {
    movement: CaravanMovement.getOptions(),
    heights: getWorldContext().pack?.cells?.h ?? null,
    heightExponent: normalizeHeightExponent(useOptionsState.getState().heightExponent),
    month
  };
}

export class CaravansModule {
  private ensureNextCaravanId(): number {
    const nextId = getNextCaravanId();
    if (nextId) return nextId;
    const caravans = getCaravans();
    const computed = caravans.length > 0 ? Math.max(...caravans.map(c => c.i)) + 1 : 0;
    setNextCaravanId(computed);
    return computed;
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
      bake.heightExponent
    );
    const good = getGoods()[deal.good];
    const cargoSlots = good ? deal.units * getGoodCargoSlotsPerUnit(good) : 0;
    const dispatcherMarketId = MerchantTransportAssets.getDispatcherMarketId(deal);
    if (dispatcherMarketId === null) return null;
    const maxCapacitySlots = MerchantTransportAssets.getLargestAvailableRouteCapacity(
      dispatcherMarketId,
      routeSegments,
      DEFAULT_DRAFT_ANIMAL_ID
    );
    if (cargoSlots > maxCapacitySlots) return null;
    const transportAllocations = getTransportAllocations(routeSegments, cargoSlots, DEFAULT_DRAFT_ANIMAL_ID, true);
    for (const allocation of transportAllocations) allocation.usedSlots = cargoSlots;

    const caravanId = this.ensureNextCaravanId();
    const reservation = MerchantTransportAssets.reserve(dispatcherMarketId, caravanId, transportAllocations);
    const hasLandTransport = transportAllocations.some(allocation => allocation.mode === "land");
    if (hasLandTransport && !reservation) return null;

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
          cargoSlotsPerUnit: good ? getGoodCargoSlotsPerUnit(good) : undefined,
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
    if (reservation) MerchantTransportAssets.depart(reservation.reservation.id);
    setNextCaravanId(caravan.i + 1);
    deal.remainingUnits = 0;
    deal.spawned = true;
    return caravan;
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

    const markets = getMarkets();
    const burgs = world.pack.burgs;
    if (!burgs) return;

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

    for (const bundle of bundles.values()) {
      let startBurgId: number;
      if (bundle.sellerType === "market") {
        const m = markets[bundle.seller] ?? markets.find(market => market.i === bundle.seller);
        if (!m) continue;
        startBurgId = m.centerBurgId;
      } else {
        startBurgId = bundle.seller;
      }

      let endBurgId: number;
      if (bundle.buyerType === "market") {
        const m = markets[bundle.buyer] ?? markets.find(market => market.i === bundle.buyer);
        if (!m) continue;
        endBurgId = m.centerBurgId;
      } else {
        endBurgId = bundle.buyer;
      }

      const startBurg = burgs[startBurgId];
      const endBurg = burgs[endBurgId];

      if (!startBurg || !endBurg || startBurg.i === endBurg.i) continue;

      const routePath = TradeRoutePlanner.findRoutePath(startBurg.cell, endBurg.cell);
      if (!routePath || routePath.segments.length === 0) continue;

      const routeSegments: TradeRouteSegment[] = routePath.segments.map(segment => ({
        type: segment.type,
        // Preserve cell ids for grade-aware duration (Phase 1).
        points: segment.points.map(toTradeRoutePoint)
      }));
      const distance = getRouteDistanceKm(routeSegments, world.distanceScale);
      if (distance <= 0) continue;

      const durationDays = calculateRouteDurationDays(routeSegments, world.distanceScale);
      const maintenanceCost = getCaravanMaintenanceCost(durationDays);
      const transportedDeals = selectRouteCargo(bundle.deals, getGoods(), durationDays, maintenanceCost, routeSegments);
      if (!transportedDeals.length) continue;

      const dispatcherMarketId = MerchantTransportAssets.getDispatcherMarketId(bundle);
      if (dispatcherMarketId === null) continue;

      // Commercial shipments accumulate in `loading` without reserving fleet assets. Assets are
      // reserved only at departure so a half-empty hold does not lock a cart or hull for weeks.
      while (true) {
        const maxCapacitySlots = MerchantTransportAssets.getLargestAvailableRouteCapacity(
          dispatcherMarketId,
          routeSegments,
          DEFAULT_DRAFT_ANIMAL_ID
        );
        if (maxCapacitySlots === 0) break;

        // Prefer topping up an existing loading caravan on the same O/D before opening a new one.
        const existingLoading = getCaravans().find(
          caravan => caravan.state === "loading" && sameRouteBundle(caravan, bundle)
        );
        if (existingLoading?.loading) {
          const freeSlots = existingLoading.loading.plannedCapacitySlots - payloadUsedSlots(existingLoading);
          if (freeSlots > UNIT_EPSILON) {
            const [topUp] = buildCargoManifests(
              transportedDeals,
              getGoods(),
              routeSegments,
              DEFAULT_DRAFT_ANIMAL_ID,
              freeSlots
            );
            if (topUp?.items.length) {
              appendPayloadFromManifest(existingLoading, topUp);
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
          routeSegments,
          DEFAULT_DRAFT_ANIMAL_ID,
          maxCapacitySlots
        );
        if (!manifest?.items.length) break;

        // Accumulate toward one ready vehicle / hull's bottleneck capacity.
        const plannedCapacitySlots = maxCapacitySlots;

        const bake = resolveBakeContext(getSimulationMonth());
        const travelLegs = bakeCaravanTravelLegs(
          routeSegments,
          world.distanceScale,
          DEFAULT_DRAFT_ANIMAL_ID,
          bake.movement,
          bake.month,
          bake.heights,
          bake.heightExponent
        );

        const dayOfMonth = getSimulationDay();
        const logistics = TradeLogisticsSettings.getOptions();
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
          loading: {
            waitedDays: 0,
            maxWaitDays: maxWaitDaysForRoute(routeSegments, distance, {
              maxWaitDaysLand: logistics.maxWaitDaysLand,
              maxWaitDaysSea: logistics.maxWaitDaysSea,
              maxWaitDaysShortSea: logistics.maxWaitDaysShortSea,
              shortSeaDistanceKm: logistics.shortSeaDistanceKm
            }),
            targetUtilization: logistics.targetUtilization,
            minSailUtilization: logistics.minSailUtilization,
            plannedCapacitySlots,
            sailScheduleDays: [...logistics.sailDays],
            nextSailDay: nextScheduledSailDay(dayOfMonth, logistics.sailDays)
          }
        };
        appendPayloadFromManifest(caravan, manifest);
        if (!caravan.payload.length) break;
        getCaravans().push(caravan);

        // Immediate depart when the first load already meets the fill target (common for large deals).
        tryDepartLoadingCaravan(caravan);
      }
    }

    setNextCaravanId(nextId);
  }

  tick(deltaDays: number): CaravanTickResult {
    const world = getWorldContext();
    const markets = getMarkets();
    decayCaravanArrivalVolume(markets, deltaDays);
    MerchantTransportAssets.recoverMaintenance(deltaDays);

    const caravans = getCaravans();
    if (!caravans.length) return { arrived: [], lost: [] };

    const movement = CaravanMovement.getOptions();
    const month = getSimulationMonth();
    const arrived: Caravan[] = [];
    const lost: Caravan[] = [];

    // Advance accumulation clocks and attempt scheduled / full-enough departures.
    for (const caravan of caravans) {
      if (caravan.state !== "loading" || !caravan.loading) continue;
      caravan.loading.waitedDays += deltaDays;
      const outcome = tryDepartLoadingCaravan(caravan);
      if (outcome === "cancelled") lost.push(caravan);
    }

    for (const caravan of caravans) {
      if (caravan.state !== "transit") continue;

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
          MerchantTransportAssets.settleCaravan(caravan, "lost");
          settlePayloadCapital(caravan, "lost");
          settleFoodCoLoadOnLoss(caravan);
          lost.push(caravan);
          const destinationStateId = world.pack.burgs[destinationBurgId]?.state ?? 0;
          TradeSecurity.recordCaravanLoss(destinationStateId);
          continue;
        }
      }

      if (caravan.currentDistance >= caravan.totalDistance) {
        caravan.state = "arrived";
        MerchantTransportAssets.settleCaravan(caravan, "arrived");
        settlePayloadCapital(caravan, "arrived");
        settleFoodCoLoadOnArrival(caravan, world.distanceScale);

        // Add ordinary (non-food-co-load) goods to target market retail stock
        if (caravan.buyerType === "market") {
          const buyerMarket = markets.find(market => market.i === caravan.buyer);
          if (buyerMarket) {
            for (const item of caravan.payload) {
              if (item.isFoodCoLoad) continue;
              const good = buyerMarket.goods[item.goodId];
              if (good) {
                good.stock = rn(good.stock + item.units, 2);
              }
            }
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

        arrived.push(caravan);
      }
    }

    // Keep loading + transit; drop terminal arrived/lost (including cancelled thin loads).
    setCaravans(caravans.filter(c => c.state === "loading" || c.state === "transit"));
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
  maintenanceCost: number,
  routeSegments: readonly TradeRouteSegment[]
): Deal[] {
  const world = getWorldContext();
  const routeMaxTemperatureC = getRouteMaxTemperatureC(routeSegments, world.pack.cells?.g, world.grid.cells?.temp);
  const eligible = deals.filter(deal => {
    const good = goods[deal.good];
    return Boolean(good && isGoodTradePermitted(good, durationDays, routeSegments, routeMaxTemperatureC));
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
