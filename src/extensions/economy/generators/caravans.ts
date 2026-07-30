import { landTravelLegSpeeds } from "../../../services/routeGrade";
import { normalizeHeightExponent } from "../../../utils/height";
import { useOptionsState } from "../../hostCore";
import { rn } from "../../hostUtils";
import {
  getCaravans,
  getGoods,
  getMarkets,
  getNextCaravanId,
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
import type { Good } from "./goods-generator";
import type { Caravan, Deal, Market, TradeRouteSegment } from "./marketTypes";
import { TradeAnimation } from "./trade-animation";
import { getCaravanMaintenanceCost, isGoodTradePermitted, MIN_TRADE_PROFIT } from "./tradeOpportunityEstimator";
import { calculateRouteDurationDays, getRouteDistanceKm } from "./tradeRouteDuration";
import { TradeSecurity } from "./tradeSecurity";

export type CaravanTravelLeg = { endKm: number; speedKmPerDay: number };

/** Halves a market's tracked `caravanArrivalVolume` roughly every two months of no new arrivals. */
const CARAVAN_VOLUME_HALF_LIFE_DAYS = 60;
const CARAVAN_VOLUME_DECAY_RATE = Math.LN2 / CARAVAN_VOLUME_HALF_LIFE_DAYS;

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

    if (seg.type === "water") {
      let runKm = 0;
      for (let i = 0; i < seg.points.length - 1; i++) {
        const [x1, y1] = seg.points[i];
        const [x2, y2] = seg.points[i + 1];
        runKm += Math.hypot(x2 - x1, y2 - y1) * distanceScale;
      }
      if (runKm <= 0) continue;
      const from = toXy(seg.points[0]);
      const to = toXy(seg.points[seg.points.length - 1]);
      const currentMultiplier = getSeaConditionMultiplier(from, to, month, movement.seaCurrentStrength);
      const speed = movement.seaKmPerDay * currentMultiplier;
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

    const caravan: Caravan = {
      i: this.ensureNextCaravanId(),
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
          strategicProcurementOrderId: deal.strategicProcurementOrderId
        }
      ],
      units: rn(deal.units, 2),
      value: rn(deal.price * deal.units, 2),
      draftAnimalId: DEFAULT_DRAFT_ANIMAL_ID,
      routeSegments,
      totalDistance,
      currentDistance: 0,
      travelLegs,
      state: "transit"
    };

    getCaravans().push(caravan);
    setNextCaravanId(caravan.i + 1);
    deal.spawned = true;
    return caravan;
  }

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
    const bundles = new Map<
      RouteKey,
      {
        seller: number;
        sellerType: "burg" | "market";
        buyer: number;
        buyerType: "burg" | "market";
        deals: Deal[];
      }
    >();

    for (const deal of deals) {
      if (deal.units <= 0 || deal.spawned) continue;
      deal.spawned = true;

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
    }

    for (const bundle of bundles.values()) {
      let startBurgId: number;
      if (bundle.sellerType === "market") {
        const m = markets[bundle.seller];
        if (!m) continue;
        startBurgId = m.centerBurgId;
      } else {
        startBurgId = bundle.seller;
      }

      let endBurgId: number;
      if (bundle.buyerType === "market") {
        const m = markets[bundle.buyer];
        if (!m) continue;
        endBurgId = m.centerBurgId;
      } else {
        endBurgId = bundle.buyer;
      }

      const startBurg = burgs[startBurgId];
      const endBurg = burgs[endBurgId];

      if (!startBurg || !endBurg || startBurg.i === endBurg.i) continue;

      const routePath = TradeAnimation.findRoutePath(startBurg.cell, endBurg.cell);
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
      const transportedDeals = bundle.deals.filter(deal =>
        isDealWorthTransporting(deal, getGoods(), durationDays, maintenanceCost, routeSegments)
      );
      if (!transportedDeals.length) continue;

      let totalUnits = 0;
      let totalValue = 0;
      const payload = transportedDeals.map(d => {
        const value = d.price * d.units;
        totalUnits += d.units;
        totalValue += value;
        return {
          goodId: d.good,
          dealId: d.i,
          units: d.units,
          value,
          strategicProcurementOrderId: d.strategicProcurementOrderId
        };
      });

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

      const caravan: Caravan = {
        i: nextId++,
        seller: bundle.seller,
        sellerType: bundle.sellerType,
        buyer: bundle.buyer,
        buyerType: bundle.buyerType,
        payload,
        units: rn(totalUnits, 2),
        value: rn(totalValue, 2),
        draftAnimalId: DEFAULT_DRAFT_ANIMAL_ID,
        routeSegments,
        totalDistance: distance,
        currentDistance: 0,
        travelLegs,
        state: "transit"
      };

      getCaravans().push(caravan);
    }

    setNextCaravanId(nextId);
  }

  tick(deltaDays: number): CaravanTickResult {
    const world = getWorldContext();
    const markets = getMarkets();
    decayCaravanArrivalVolume(markets, deltaDays);

    const caravans = getCaravans();
    if (!caravans.length) return { arrived: [], lost: [] };

    const movement = CaravanMovement.getOptions();
    const month = getSimulationMonth();
    const arrived: Caravan[] = [];
    const lost: Caravan[] = [];

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
          lost.push(caravan);
          const destinationStateId = world.pack.burgs[destinationBurgId]?.state ?? 0;
          TradeSecurity.recordCaravanLoss(destinationStateId);
          continue;
        }
      }

      if (caravan.currentDistance >= caravan.totalDistance) {
        caravan.state = "arrived";

        // Add goods to target market
        if (caravan.buyerType === "market") {
          const buyerMarket = markets.find(market => market.i === caravan.buyer);
          if (buyerMarket) {
            for (const item of caravan.payload) {
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

    // Clean up arrived/lost caravans
    setCaravans(caravans.filter(c => c.state === "transit"));
    return { arrived, lost };
  }
}

function isDealWorthTransporting(
  deal: Deal,
  goods: Good[],
  durationDays: number,
  maintenanceCost: number,
  routeSegments: readonly TradeRouteSegment[]
): boolean {
  const good = goods[deal.good];
  if (!good || !isGoodTradePermitted(good, durationDays, routeSegments)) return false;

  // Market-to-market deals have already passed the full net-profit calculation in
  // Markets.runGlobalTrade. Burg↔market deals represent local market aggregation and do not
  // retain a margin, so use their cargo value as a conservative upper bound: a shipment whose
  // entire value cannot cover the route's fixed cost must never appear as a caravan.
  if (deal.sellerType === "market" && deal.buyerType === "market") return true;
  return deal.price * deal.units - maintenanceCost >= MIN_TRADE_PROFIT;
}

export const Caravans = new CaravansModule();
