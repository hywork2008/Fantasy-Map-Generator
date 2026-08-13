import { landTravelLegSpeeds } from "../../../services/routeGrade";
import { normalizeHeightExponent } from "../../../utils/height";
import { useOptionsState, type WorldContext } from "../../hostCore";
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
  getDraftAnimalType,
  getSeaConditionMultiplier,
  type OceanCurrentSample
} from "./caravanMovement";
import { ExportStaging } from "./exportStaging";
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
import { utilizationOf } from "./marketFlowBudget";
import type { Caravan, Deal, ExportStagingLot, Market, TradeRoutePoint, TradeRouteSegment } from "./marketTypes";
import { MerchantTradeCapital } from "./merchantTradeCapital";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import { markRetailInventoryDirty } from "./retailInventory";
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
  isGoodTradePermittedForShipment,
  MIN_TRADE_PROFIT
} from "./tradeOpportunityEstimator";
import { calculateRouteDurationDays, getRouteDistanceKm } from "./tradeRouteDuration";
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
    recordGoodFlow({
      direction: "sink",
      category: "spoilage",
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
    let freshnessAgeDays: number | undefined;
    const good = getGoods().find(candidate => candidate.i === item.deal.good);
    // selectRouteCargo normally prevents this. Keep this boundary fail-closed so a stale
    // manifest, strategic caller, or user-edited catalogue cannot put raw food on a caravan.
    if (!good || isFreshFoodGood(good)) continue;
    // Prefer export-warehouse take when the deal (or pseudo-deal) is backed by a staging lot.
    if (item.deal.stagingLotId !== undefined) {
      const taken = ExportStaging.takeFromLot(item.deal.stagingLotId, item.units);
      units = taken.units;
      lockedCapital = taken.lockedCapital;
      freshnessAgeDays = taken.freshnessAgeDays;
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
      existing.units += units;
      existing.value += value;
      existing.lockedCapital = (existing.lockedCapital ?? 0) + lockedCapital;
      if (freshnessAgeDays !== undefined) {
        existing.freshnessAgeDays = Math.max(existing.freshnessAgeDays ?? 0, freshnessAgeDays);
      }
    } else {
      caravan.payload.push({
        goodId: item.deal.good,
        dealId: item.deal.i,
        units,
        value,
        cargoSlotsPerUnit: item.cargoSlotsPerUnit,
        strategicProcurementOrderId: item.deal.strategicProcurementOrderId,
        stagingLotId: item.deal.stagingLotId,
        lockedCapital: lockedCapital > UNIT_EPSILON ? lockedCapital : undefined,
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

/** Bring persisted loading rows in line with the current route-aware commercial policy. */
function refreshLoadingPolicy(caravan: Caravan): void {
  if (caravan.state !== "loading" || !caravan.loading) return;
  const logistics = TradeLogisticsSettings.getOptions();
  caravan.loading.maxWaitDays = maxWaitDaysForRoute(caravan.routeSegments, caravan.totalDistance, {
    maxWaitDaysLand: logistics.maxWaitDaysLand,
    maxWaitDaysSea: logistics.maxWaitDaysSea,
    maxWaitDaysShortSea: logistics.maxWaitDaysShortSea,
    shortSeaDistanceKm: logistics.shortSeaDistanceKm
  });

  // Carts have no sailing calendar. Clear stale fields from saves made before this distinction.
  if (!routeHasWater(caravan.routeSegments)) {
    caravan.loading.sailScheduleDays = undefined;
    caravan.loading.nextSailDay = undefined;
  }
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

  // Co-load staple food into free space first so it counts toward sail utilization
  // (historical ballast / bulk grain riding with higher-value general cargo).
  tryCoLoadFoodOntoCaravan(caravan, { distanceScale: getWorldContext().distanceScale });

  const usedSlots = payloadUsedSlots(caravan);
  const planned = caravan.loading.plannedCapacitySlots;
  const util = utilizationOf(usedSlots, planned);
  const dayOfMonth = getSimulationDay();
  const logistics = TradeLogisticsSettings.getOptions();
  const waterRoute = routeHasWater(caravan.routeSegments);
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
    immediateDispatch: isLocalLandRoute(caravan.routeSegments, caravan.totalDistance),
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
 * Reads the real per-cell ocean current (docs/simulation/ocean-currents.md) at a route point's
 * pack cell, via the same `pack.cells.g` -> `grid.cells.currentAngle`/`currentSpeed` lookup other
 * consumers use for `temp`/`prec`. Returns null (falls back to the seasonal bias in
 * getSeaConditionMultiplier) whenever the point carries no cell id, `worldContext` wasn't given,
 * or the map predates this field.
 */
function resolveOceanCurrentAtPoint(
  worldContext: WorldContext | null | undefined,
  point: TradeRoutePoint
): OceanCurrentSample | null {
  const packCellId = point[2];
  if (packCellId === undefined || !worldContext) return null;

  const gridCellId = worldContext.pack?.cells?.g?.[packCellId];
  const currentAngle = worldContext.grid?.cells?.currentAngle;
  const currentSpeed = worldContext.grid?.cells?.currentSpeed;
  if (gridCellId === undefined || !currentAngle || !currentSpeed) return null;

  return { angleDeg: currentAngle[gridCellId], speed: currentSpeed[gridCellId] };
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
      const from = toXy(seg.points[0]);
      const to = toXy(seg.points[seg.points.length - 1]);
      const current = seg.type === "river" ? null : resolveOceanCurrentAtPoint(worldContext, seg.points[0]);
      const currentMultiplier =
        seg.type === "river" ? 1 : getSeaConditionMultiplier(from, to, month, movement.seaCurrentStrength, current);
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
    const world = getWorldContext();
    const heights = world.pack?.cells?.h ?? null;
    legs = bakeCaravanTravelLegs(
      caravan.routeSegments,
      distanceScale,
      caravan.draftAnimalId,
      movement,
      month,
      heights,
      normalizeHeightExponent(useOptionsState.getState().heightExponent),
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
    const good = getGoods()[deal.good];
    const durationDays = calculateRouteDurationDays(routeSegments, world.distanceScale);
    const routeMaxTemperatureC = getRouteMaxTemperatureC(routeSegments, world.pack.cells?.g, world.grid.cells?.temp);
    if (!good || !isGoodTradePermitted(good, durationDays, routeSegments, routeMaxTemperatureC)) return null;
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
    const burgs = world.pack.burgs;
    if (!burgs) return nextId;

    let startBurgId: number;
    if (bundle.sellerType === "market") {
      const m = getMarketById(bundle.seller);
      if (!m) return nextId;
      startBurgId = m.centerBurgId;
    } else {
      startBurgId = bundle.seller;
    }

    let endBurgId: number;
    if (bundle.buyerType === "market") {
      const m = getMarketById(bundle.buyer);
      if (!m) return nextId;
      endBurgId = m.centerBurgId;
    } else {
      endBurgId = bundle.buyer;
    }

    const startBurg = burgs[startBurgId];
    const endBurg = burgs[endBurgId];

    if (!startBurg || !endBurg || startBurg.i === endBurg.i) return nextId;

    const routePath = TradeRoutePlanner.findRoutePath(startBurg.cell, endBurg.cell);
    if (!routePath || routePath.segments.length === 0) return nextId;

    const routeSegments: TradeRouteSegment[] = routePath.segments.map(segment => ({
      type: segment.type,
      // Preserve cell ids for grade-aware duration (Phase 1).
      points: segment.points.map(toTradeRoutePoint)
    }));
    const distance = getRouteDistanceKm(routeSegments, world.distanceScale);
    if (distance <= 0) return nextId;

    const durationDays = calculateRouteDurationDays(routeSegments, world.distanceScale);
    const maintenanceCost = getCaravanMaintenanceCost(durationDays);
    const logistics = TradeLogisticsSettings.getOptions();
    const maxLoadingWaitDays = maxWaitDaysForRoute(routeSegments, distance, {
      maxWaitDaysLand: logistics.maxWaitDaysLand,
      maxWaitDaysSea: logistics.maxWaitDaysSea,
      maxWaitDaysShortSea: logistics.maxWaitDaysShortSea,
      shortSeaDistanceKm: logistics.shortSeaDistanceKm
    });
    const transportedDeals = selectRouteCargo(
      bundle.deals,
      getGoods(),
      durationDays,
      maxLoadingWaitDays,
      maintenanceCost,
      routeSegments
    );
    if (!transportedDeals.length) return nextId;

    const dispatcherMarketId = MerchantTransportAssets.getDispatcherMarketId(bundle);
    if (dispatcherMarketId === null) return nextId;

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
        routeSegments,
        DEFAULT_DRAFT_ANIMAL_ID,
        maxCapacitySlots
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
      const addedSlots = appendPayloadFromManifest(caravan, manifest);
      if (addedSlots <= UNIT_EPSILON || !caravan.payload.length) break;
      getCaravans().push(caravan);

      // Immediate depart when the first load already meets the fill target (common for large deals).
      tryDepartLoadingCaravan(caravan);
    }

    return nextId;
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

  tick(deltaDays: number): CaravanTickResult {
    const world = getWorldContext();
    const markets = getMarkets();
    decayCaravanArrivalVolume(markets, deltaDays);
    MerchantTransportAssets.recoverMaintenance(deltaDays);
    ExportStaging.expireFreshLots(deltaDays);

    const caravans = getCaravans();
    if (!caravans.length) return { arrived: [], lost: [] };

    const movement = CaravanMovement.getOptions();
    const month = getSimulationMonth();
    const arrived: Caravan[] = [];
    const lost: Caravan[] = [];

    // Advance accumulation clocks and attempt scheduled / full-enough departures.
    for (const caravan of caravans) {
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
          MerchantTransportAssets.settleCaravan(caravan, "lost");
          settlePayloadCapital(caravan, "lost");
          settleFoodCoLoadOnLoss(caravan);
          lost.push(caravan);
          const destinationStateId = world.pack.burgs[destinationBurgId]?.state ?? 0;
          TradeSecurity.recordCaravanLoss(destinationStateId);
          continue;
        }
      }

      if (hasCaravanArrived(caravan)) {
        // Keep detail/render progress coherent until this terminal row is removed below.
        caravan.currentDistance = Math.max(caravan.currentDistance, caravan.totalDistance);
        caravan.state = "arrived";
        MerchantTransportAssets.settleCaravan(caravan, "arrived");
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
                  goodId: item.goodId,
                  units: item.units,
                  marketId: buyerMarket.i
                });
                stockChanged = true;
              }
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
  maxLoadingWaitDays: number,
  maintenanceCost: number,
  routeSegments: readonly TradeRouteSegment[]
): Deal[] {
  const world = getWorldContext();
  const routeMaxTemperatureC = getRouteMaxTemperatureC(routeSegments, world.pack.cells?.g, world.grid.cells?.temp);
  const eligible = deals.filter(deal => {
    const good = goods[deal.good];
    return Boolean(
      good &&
        isGoodTradePermittedForShipment(good, durationDays, maxLoadingWaitDays, routeSegments, routeMaxTemperatureC)
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
