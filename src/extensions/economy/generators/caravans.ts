import { rn } from "../../hostUtils";
import {
  getCaravans,
  getGoods,
  getMarkets,
  getNextCaravanId,
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
import type { Caravan, Deal, TradeRouteSegment } from "./marketTypes";
import { TradeAnimation } from "./trade-animation";
import { getCaravanMaintenanceCost, isGoodTradePermitted, MIN_TRADE_PROFIT } from "./tradeOpportunityEstimator";
import { calculateRouteDurationDays, getRouteDistanceKm } from "./tradeRouteDuration";

interface SegmentBoundary {
  type: "land" | "water";
  endKm: number;
  fromPoint: [number, number];
  toPoint: [number, number];
}

export interface CaravanTickResult {
  arrived: Caravan[];
  lost: Caravan[];
}

function buildSegmentBoundaries(caravan: Caravan, distanceScale: number): SegmentBoundary[] {
  let cursorKm = 0;
  return caravan.routeSegments.map(seg => {
    let lengthRaw = 0;
    for (let i = 0; i < seg.points.length - 1; i++) {
      const [x1, y1] = seg.points[i];
      const [x2, y2] = seg.points[i + 1];
      lengthRaw += Math.hypot(x2 - x1, y2 - y1);
    }
    cursorKm += lengthRaw * distanceScale;
    return {
      type: seg.type,
      endKm: cursorKm,
      fromPoint: seg.points[0],
      toPoint: seg.points[seg.points.length - 1]
    };
  });
}

function getSegmentSpeedKmPerDay(
  segment: SegmentBoundary,
  caravan: Caravan,
  month: number,
  movement: CaravanMovementSettings
): number {
  if (segment.type === "land") {
    return movement.landKmPerDay * getDraftAnimalType(caravan.draftAnimalId).speedMultiplier;
  }
  const currentMultiplier = getSeaConditionMultiplier(
    segment.fromPoint,
    segment.toPoint,
    month,
    movement.seaCurrentStrength
  );
  return movement.seaKmPerDay * currentMultiplier;
}

/**
 * Walks currentDistance forward by deltaDays, crossing land/water segment boundaries within a
 * single call (e.g. "Advance Month" spans many segments at once) so each segment consumes the
 * day budget at its own speed instead of one flat rate for the whole route.
 */
function advanceCaravan(
  caravan: Caravan,
  deltaDays: number,
  distanceScale: number,
  month: number,
  movement: CaravanMovementSettings
): void {
  const boundaries = buildSegmentBoundaries(caravan, distanceScale);
  if (boundaries.length === 0) return;

  let remainingDays = deltaDays;
  let segIndex = boundaries.findIndex(b => caravan.currentDistance < b.endKm);
  if (segIndex === -1) segIndex = boundaries.length - 1;

  while (remainingDays > 0 && segIndex < boundaries.length) {
    const segment = boundaries[segIndex];
    const speed = getSegmentSpeedKmPerDay(segment, caravan, month, movement);
    if (speed <= 0) break;

    const remainingInSegment = Math.max(0, segment.endKm - caravan.currentDistance);
    const daysToFinishSegment = remainingInSegment / speed;

    if (daysToFinishSegment <= remainingDays) {
      caravan.currentDistance = segment.endKm;
      remainingDays -= daysToFinishSegment;
      segIndex++;
    } else {
      caravan.currentDistance += speed * remainingDays;
      remainingDays = 0;
    }
  }
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
        points: segment.points.map(([x, y]) => [x, y])
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
        state: "transit"
      };

      getCaravans().push(caravan);
    }

    setNextCaravanId(nextId);
  }

  tick(deltaDays: number): CaravanTickResult {
    const world = getWorldContext();
    const caravans = getCaravans();
    if (!caravans.length) return { arrived: [], lost: [] };

    const movement = CaravanMovement.getOptions();
    const month = world.options.month ?? 1;
    const markets = getMarkets();
    const arrived: Caravan[] = [];
    const lost: Caravan[] = [];

    for (const caravan of caravans) {
      if (caravan.state !== "transit") continue;

      advanceCaravan(caravan, deltaDays, world.distanceScale, month, movement);

      // Calculate Bandit Risk based on route path or simple market states
      // For now, default is 0. If there's a war in the region, risk increases.
      const buyerMarket = markets.find(market => market.i === caravan.buyer);
      let banditRiskPerDay = 0;
      if (buyerMarket) {
        const ledger = getBurgMarketLedger(buyerMarket.centerBurgId);
        if (ledger?.warIntensity) {
          banditRiskPerDay = 0.001 * ledger.warIntensity; // 0.1% chance per day per intensity level
        }
      }

      if (banditRiskPerDay > 0) {
        const risk = banditRiskPerDay * deltaDays;
        if (Math.random() < risk) {
          caravan.state = "lost";
          lost.push(caravan);
          // We could optionally generate a news log or notification here
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
