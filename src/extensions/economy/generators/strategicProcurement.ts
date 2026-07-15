import {
  SHIPBUILDING_MATERIAL_IDS,
  type ShipbuildingProcurementStatus,
  type ShipbuildingStrategicProcurementDemand
} from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { Caravans } from "./caravans";
import type { Good } from "./goods-generator";
import type { Caravan, Deal, Market, TradeRouteSegment } from "./marketTypes";
import {
  type ForeignProcurementMode,
  getMarketStateId,
  getStrategicMarketRelationship,
  rankStrategicProcurementCandidates,
  type StrategicGoodsPolicy,
  type StrategicProcurementCandidate
} from "./strategicProcurementPolicy";
import { registerStrategicProcurementExpense } from "./taxes-generator";
import { TradeAnimation } from "./trade-animation";
import { getTransportCost } from "./tradeOpportunityEstimator";
import { calculateRouteDurationDays, getRouteDistanceMapUnits } from "./tradeRouteDuration";

export type ProcurementOrderStatus = "open" | "assigned" | "inTransit" | "fulfilled" | "blocked" | "cancelled";
export type ProcurementOrderBlockedReason = "noDomesticSupply" | "foreignPolicy" | "noRoute" | "insufficientTreasury";

export interface ProcurementOrder {
  id: number;
  stateId: number;
  destinationMarketId: number;
  goodId: number;
  requestedUnits: number;
  fulfilledUnits: number;
  maxLandedUnitPrice: number;
  status: ProcurementOrderStatus;
  sourceMarketId?: number;
  caravanId?: number;
  blockedReason?: ProcurementOrderBlockedReason;
}

interface ProcurementRoute {
  segments: TradeRouteSegment[];
  distance: number;
  durationDays: number;
}

interface CandidateWithRoute extends StrategicProcurementCandidate {
  route: ProcurementRoute;
}

const DEFAULT_POLICY: Omit<StrategicGoodsPolicy, "stateId" | "goodIds"> = {
  foreignProcurement: "alliesAndNeutral",
  enemyTrade: "prohibited",
  targetReserveDays: 365,
  domesticPurchasePremium: 0,
  maxProcurementDays: 90
};
const SUPPLIER_SAFETY_RESERVE_FACTOR = 0.2;
const EPSILON = 0.000001;

export class StrategicProcurementModule {
  private get worldContext() {
    return getWorldContext();
  }

  getOrders(): readonly ProcurementOrder[] {
    return this.worldContext.pack.strategicProcurementOrders ?? [];
  }

  getShipbuildingProcurementStatus(stateId: number, destinationMarketId: number): ShipbuildingProcurementStatus[] {
    const { pack } = this.worldContext;
    return SHIPBUILDING_MATERIAL_IDS.map(material => {
      const good = pack.goods.find(candidate => candidate.name === material);
      const matchingOrders = good
        ? this.getOrders().filter(
            order =>
              order.stateId === stateId && order.destinationMarketId === destinationMarketId && order.goodId === good.i
          )
        : [];
      const inTransitOrders = matchingOrders.filter(order => order.status === "inTransit");
      const latestBlockedOrder = matchingOrders
        .filter(order => order.status === "blocked")
        .toSorted((a, b) => b.id - a.id)[0];
      const sourceStateId =
        inTransitOrders.length > 0 && inTransitOrders[0].sourceMarketId !== undefined
          ? getMarketStateId(
              pack.markets.find(market => market.i === inTransitOrders[0].sourceMarketId) ?? { centerBurgId: -1 },
              pack.burgs
            )
          : null;

      return {
        material,
        inTransit: rn(
          inTransitOrders.reduce((sum, order) => sum + order.requestedUnits - order.fulfilledUnits, 0),
          2
        ),
        sourceStateId,
        blockedReason: latestBlockedOrder?.blockedReason
      };
    });
  }

  clear(): void {
    this.worldContext.pack.strategicProcurementOrders = [];
    this.worldContext.pack.strategicGoodsPolicies = [];
    this.worldContext.pack.nextStrategicProcurementOrderId = 0;
  }

  handleShipbuildingDemand(demand: ShipbuildingStrategicProcurementDemand): void {
    const { pack } = this.worldContext;
    const state = pack.states[demand.stateId];
    const destination = pack.markets.find(market => market.i === demand.destinationMarketId);
    if (!state || state.removed || !destination) return;

    const materialGoodIds = Object.entries(demand.annualMaterials)
      .map(([name, annualDemand]) => {
        const good = pack.goods.find(candidate => candidate.name === name);
        return good && annualDemand > 0 ? good.i : undefined;
      })
      .filter((goodId): goodId is number => goodId !== undefined);
    const policy = this.getOrCreatePolicy(demand.stateId, materialGoodIds);

    for (const [name, annualDemand] of Object.entries(demand.annualMaterials)) {
      if (!(annualDemand > 0)) continue;
      const good = pack.goods.find(candidate => candidate.name === name);
      if (!good || !policy.goodIds.includes(good.i)) continue;
      this.procureToReserve({ stateId: demand.stateId, destination, good, annualDemand, policy });
    }
  }

  reconcileCaravans(arrived: readonly Caravan[], lost: readonly Caravan[]): void {
    const orders = this.getOrders();
    for (const caravan of arrived) this.reconcileCaravan(caravan, orders, "fulfilled");
    for (const caravan of lost) this.reconcileCaravan(caravan, orders, "blocked");
  }

  private reconcileCaravan(
    caravan: Caravan,
    orders: readonly ProcurementOrder[],
    outcome: "fulfilled" | "blocked"
  ): void {
    for (const payload of caravan.payload) {
      const orderId = payload.strategicProcurementOrderId;
      if (orderId === undefined) continue;
      const order = orders.find(candidate => candidate.id === orderId);
      if (!order || order.caravanId !== caravan.i || order.status !== "inTransit") continue;

      if (outcome === "fulfilled") {
        order.fulfilledUnits = rn(order.fulfilledUnits + payload.units, 2);
        order.status = "fulfilled";
        order.blockedReason = undefined;
      } else {
        order.status = "blocked";
        order.blockedReason = "noRoute";
      }
    }
  }

  private procureToReserve({
    stateId,
    destination,
    good,
    annualDemand,
    policy
  }: {
    stateId: number;
    destination: Market;
    good: Good;
    annualDemand: number;
    policy: StrategicGoodsPolicy;
  }): void {
    if (!destination.goods[good.i]) destination.goods[good.i] = { stock: 0, price: good.value };
    const destinationStock = destination.goods[good.i].stock;
    const targetStock = annualDemand * (policy.targetReserveDays / 365);
    const assignedUnits = this.getOrders()
      .filter(
        order =>
          order.stateId === stateId &&
          order.destinationMarketId === destination.i &&
          order.goodId === good.i &&
          (order.status === "open" || order.status === "assigned" || order.status === "inTransit")
      )
      .reduce((sum, order) => sum + Math.max(0, order.requestedUnits - order.fulfilledUnits), 0);
    let remainingUnits = targetStock - destinationStock - assignedUnits;
    if (remainingUnits <= EPSILON) return;

    const candidates = this.buildCandidates(destination, good, policy);
    const ranked = rankStrategicProcurementCandidates(candidates, policy.foreignProcurement) as CandidateWithRoute[];
    if (!ranked.length) {
      this.createBlockedOrder({
        stateId,
        destinationMarketId: destination.i,
        goodId: good.i,
        requestedUnits: remainingUnits,
        reason: this.getBlockedReason(candidates, policy.foreignProcurement)
      });
      return;
    }

    let remainingBlockedReason: ProcurementOrderBlockedReason | undefined;
    for (const candidate of ranked) {
      if (remainingUnits <= EPSILON) break;
      const units = Math.min(remainingUnits, candidate.availableUnits);
      const order = this.createOrder({
        stateId,
        destinationMarketId: destination.i,
        goodId: good.i,
        requestedUnits: units,
        maxLandedUnitPrice: candidate.landedUnitPrice,
        sourceMarketId: candidate.sourceMarketId
      });

      const treasury = this.worldContext.pack.states[stateId]?.treasury ?? 0;
      const totalCost = candidate.landedUnitPrice * units;
      if (treasury + EPSILON < totalCost) {
        order.status = "blocked";
        order.blockedReason = "insufficientTreasury";
        remainingBlockedReason = "insufficientTreasury";
        break;
      }

      const source = this.worldContext.pack.markets.find(market => market.i === candidate.sourceMarketId);
      const sourceGood = source?.goods[good.i];
      if (!source || !sourceGood || sourceGood.stock + EPSILON < units) {
        order.status = "blocked";
        order.blockedReason = "noDomesticSupply";
        remainingBlockedReason = "noDomesticSupply";
        continue;
      }

      const deal = this.createDeal({
        source,
        destination,
        good,
        units,
        landedUnitPrice: candidate.landedUnitPrice,
        order
      });
      const caravan = Caravans.spawnStrategicProcurement(deal, candidate.route.segments);
      if (!caravan) {
        this.worldContext.pack.deals.pop();
        order.status = "blocked";
        order.blockedReason = "noRoute";
        continue;
      }

      sourceGood.stock = rn(Math.max(0, sourceGood.stock - units), 2);
      const state = this.worldContext.pack.states[stateId];
      if (state) state.treasury = rn(Math.max(0, treasury - totalCost), 2);
      registerStrategicProcurementExpense(stateId, totalCost);
      const sourceBurg = this.worldContext.pack.burgs[source.centerBurgId];
      if (sourceBurg) sourceBurg.treasury = rn((sourceBurg.treasury ?? 0) + sourceGood.price * units, 2);
      order.status = "inTransit";
      order.caravanId = caravan.i;
      remainingUnits -= units;
    }

    if (remainingUnits > EPSILON) {
      this.createBlockedOrder({
        stateId,
        destinationMarketId: destination.i,
        goodId: good.i,
        requestedUnits: remainingUnits,
        reason: remainingBlockedReason ?? "noDomesticSupply"
      });
    }
  }

  private buildCandidates(destination: Market, good: Good, policy: StrategicGoodsPolicy): CandidateWithRoute[] {
    const { pack } = this.worldContext;
    const mapDiagonal = Math.hypot(this.worldContext.graphWidth, this.worldContext.graphHeight) || 1;
    const candidates: CandidateWithRoute[] = [];

    for (const source of pack.markets) {
      if (source.i === destination.i) continue;
      const sourceGood = source.goods[good.i];
      if (!sourceGood) continue;

      const relationship = getStrategicMarketRelationship(destination, source, pack.burgs, pack.states);
      const availableUnits = Math.max(0, sourceGood.stock * (1 - SUPPLIER_SAFETY_RESERVE_FACTOR));
      const route = this.getRoute(source, destination);
      if (!route || route.durationDays > policy.maxProcurementDays) continue;

      const sourceBurg = pack.burgs[source.centerBurgId];
      const salesTax = sourceBurg?.state ? (pack.states[sourceBurg.state]?.salesTax ?? 0) : 0;
      const landedUnitPrice =
        sourceGood.price + sourceGood.price * salesTax + getTransportCost(route.distance, mapDiagonal) * good.value;
      candidates.push({
        sourceMarketId: source.i,
        sourceStateId: getMarketStateId(source, pack.burgs),
        relationship,
        landedUnitPrice,
        durationDays: route.durationDays,
        availableUnits,
        route
      });
    }

    return candidates;
  }

  private getRoute(source: Market, destination: Market): ProcurementRoute | null {
    const { pack } = this.worldContext;
    const sourceBurg = pack.burgs[source.centerBurgId];
    const destinationBurg = pack.burgs[destination.centerBurgId];
    if (!sourceBurg || !destinationBurg || sourceBurg.i === destinationBurg.i) return null;

    const routePath = TradeAnimation.findRoutePath(sourceBurg.cell, destinationBurg.cell);
    const segments: TradeRouteSegment[] = routePath?.segments?.length
      ? routePath.segments.map(segment => ({
          type: segment.type,
          points: segment.points.map(([x, y]) => [x, y])
        }))
      : [
          {
            type: "land",
            points: [
              [sourceBurg.x, sourceBurg.y],
              [destinationBurg.x, destinationBurg.y]
            ]
          }
        ];
    const distance = getRouteDistanceMapUnits(segments);
    if (distance <= 0) return null;
    return { segments, distance, durationDays: calculateRouteDurationDays(segments, this.worldContext.distanceScale) };
  }

  private getOrCreatePolicy(stateId: number, goodIds: number[]): StrategicGoodsPolicy {
    if (!this.worldContext.pack.strategicGoodsPolicies) this.worldContext.pack.strategicGoodsPolicies = [];
    const policies = this.worldContext.pack.strategicGoodsPolicies;
    const existing = policies.find(policy => policy.stateId === stateId);
    if (existing) {
      existing.goodIds = Array.from(new Set([...existing.goodIds, ...goodIds]));
      return existing;
    }

    const policy: StrategicGoodsPolicy = { stateId, goodIds: [...goodIds], ...DEFAULT_POLICY };
    policies.push(policy);
    return policy;
  }

  private createOrder(order: Omit<ProcurementOrder, "id" | "fulfilledUnits" | "status">): ProcurementOrder {
    if (!this.worldContext.pack.strategicProcurementOrders) this.worldContext.pack.strategicProcurementOrders = [];
    const orders = this.worldContext.pack.strategicProcurementOrders;
    const nextId = this.worldContext.pack.nextStrategicProcurementOrderId ?? 0;
    this.worldContext.pack.nextStrategicProcurementOrderId = nextId + 1;
    const created: ProcurementOrder = { id: nextId, fulfilledUnits: 0, status: "open", ...order };
    orders.push(created);
    return created;
  }

  private createBlockedOrder({
    stateId,
    destinationMarketId,
    goodId,
    requestedUnits,
    reason
  }: {
    stateId: number;
    destinationMarketId: number;
    goodId: number;
    requestedUnits: number;
    reason: ProcurementOrderBlockedReason;
  }): ProcurementOrder {
    const existing = this.getOrders().find(
      order =>
        order.stateId === stateId &&
        order.destinationMarketId === destinationMarketId &&
        order.goodId === goodId &&
        order.status === "blocked"
    );
    if (existing) {
      existing.requestedUnits = rn(Math.max(0, requestedUnits), 2);
      existing.blockedReason = reason;
      return existing;
    }

    const order = this.createOrder({
      stateId,
      destinationMarketId,
      goodId,
      requestedUnits: rn(Math.max(0, requestedUnits), 2),
      maxLandedUnitPrice: 0,
      blockedReason: reason
    });
    order.status = "blocked";
    return order;
  }

  private createDeal({
    source,
    destination,
    good,
    units,
    landedUnitPrice,
    order
  }: {
    source: Market;
    destination: Market;
    good: Good;
    units: number;
    landedUnitPrice: number;
    order: ProcurementOrder;
  }): Deal {
    const sourceBurg = this.worldContext.pack.burgs[source.centerBurgId];
    const salesTax = sourceBurg?.state ? (this.worldContext.pack.states[sourceBurg.state]?.salesTax ?? 0) : 0;
    const deal: Deal = {
      i: this.worldContext.pack.deals.length,
      seller: source.i,
      sellerType: "market",
      buyer: destination.i,
      buyerType: "market",
      good: good.i,
      units: rn(units, 2),
      price: rn(landedUnitPrice, 2),
      tax: rn(source.goods[good.i].price * salesTax * units, 2),
      purpose: "strategicProcurement",
      payerStateId: order.stateId,
      strategicProcurementOrderId: order.id
    };
    this.worldContext.pack.deals.push(deal);
    return deal;
  }

  private getBlockedReason(
    candidates: readonly CandidateWithRoute[],
    foreignProcurement: ForeignProcurementMode
  ): ProcurementOrderBlockedReason {
    if (candidates.some(candidate => candidate.relationship === "enemy")) return "foreignPolicy";
    if (candidates.length) return "noDomesticSupply";
    if (foreignProcurement === "domesticOnly") return "noDomesticSupply";
    return "noRoute";
  }
}

export const StrategicProcurement = new StrategicProcurementModule();
