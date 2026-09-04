import {
  SHIPBUILDING_MATERIAL_IDS,
  type ShipbuildingProcurementStatus,
  type ShipbuildingStrategicProcurementDemand
} from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getDeals,
  getGoods,
  getMarketById,
  getMarkets,
  getNextStrategicProcurementOrderId,
  getStrategicGoodsPolicies,
  getStrategicProcurementOrders,
  getWorldContext,
  setNextStrategicProcurementOrderId,
  setStrategicGoodsPolicies,
  setStrategicProcurementOrders
} from "../economyContext";
import { Caravans } from "./caravans";
import type { Good } from "./goods-generator";
import type { Caravan, Deal, Market, TradeRouteSegment } from "./marketTypes";
import { markRetailInventoryDirty } from "./retailInventory";
import {
  type ForeignProcurementMode,
  getMarketStateId,
  getStrategicMarketRelationship,
  rankStrategicProcurementCandidates,
  type StrategicGoodsPolicy,
  type StrategicProcurementCandidate
} from "./strategicProcurementPolicy";
import type {
  ProcurementOrder,
  ProcurementOrderBlockedReason,
  ProcurementOrderPurpose
} from "./strategicProcurementTypes";
import { registerStrategicProcurementExpense } from "./taxes-generator";
import { getTransportCost } from "./tradeOpportunityEstimator";
import { calculateRouteDurationDays, getRouteDistanceMapUnits } from "./tradeRouteDuration";
import { TradeRoutePlanner } from "./tradeRoutePlanner";

export type {
  ProcurementOrder,
  ProcurementOrderBlockedReason,
  ProcurementOrderPurpose,
  ProcurementOrderStatus
} from "./strategicProcurementTypes";

/** A material shortage from the Metallurg queue, funded by the market's governing State. */
export interface MetallurgMaterialProcurementDemand {
  stateId: number;
  destinationMarketId: number;
  goodId: number;
  requestedUnits: number;
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

function hasPurpose(order: ProcurementOrder, purpose: ProcurementOrderPurpose): boolean {
  return (order.purpose ?? "shipbuilding") === purpose;
}

export class StrategicProcurementModule {
  private get worldContext() {
    return getWorldContext();
  }

  getOrders(): readonly ProcurementOrder[] {
    return getStrategicProcurementOrders();
  }

  getShipbuildingProcurementStatus(stateId: number, destinationMarketId: number): ShipbuildingProcurementStatus[] {
    const { pack } = this.worldContext;
    const goods = getGoods();
    return SHIPBUILDING_MATERIAL_IDS.map(material => {
      const good = goods.find(candidate => candidate.name === material);
      const matchingOrders = good
        ? this.getOrders().filter(
            order =>
              order.stateId === stateId &&
              order.destinationMarketId === destinationMarketId &&
              order.goodId === good.i &&
              hasPurpose(order, "shipbuilding")
          )
        : [];
      const inTransitOrders = matchingOrders.filter(order => order.status === "inTransit");
      const latestBlockedOrder = matchingOrders
        .filter(order => order.status === "blocked")
        .toSorted((a, b) => b.id - a.id)[0];
      const sourceStateId =
        inTransitOrders.length > 0 && inTransitOrders[0].sourceMarketId !== undefined
          ? getMarketStateId(getMarketById(inTransitOrders[0].sourceMarketId) ?? { centerBurgId: -1 }, pack.burgs)
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
    setStrategicProcurementOrders([]);
    setStrategicGoodsPolicies([]);
    setNextStrategicProcurementOrderId(0);
  }

  handleShipbuildingDemand(demand: ShipbuildingStrategicProcurementDemand): void {
    const { pack } = this.worldContext;
    const goods = getGoods();
    const state = pack.states[demand.stateId];
    const destination = getMarketById(demand.destinationMarketId);
    if (!state || state.removed || !destination) return;

    const materialGoodIds = Object.entries(demand.annualMaterials)
      .map(([name, annualDemand]) => {
        const good = goods.find(candidate => candidate.name === name);
        return good && annualDemand > 0 ? good.i : undefined;
      })
      .filter((goodId): goodId is number => goodId !== undefined);
    const policy = this.getOrCreatePolicy(demand.stateId, materialGoodIds);

    for (const [name, annualDemand] of Object.entries(demand.annualMaterials)) {
      if (!(annualDemand > 0)) continue;
      const good = goods.find(candidate => candidate.name === name);
      if (!good || !policy.goodIds.includes(good.i)) continue;
      this.refreshOpenOrderPriority(demand.stateId, demand.destinationMarketId, good.i, "shipbuilding");
      this.procureToReserve({ stateId: demand.stateId, destination, good, annualDemand, policy });
    }
  }

  /**
   * Converts an outstanding Metallurg material shortage into its own state-funded purchase order.
   * It shares routes and caravans with other public procurement, but never coalesces with
   * shipbuilding orders, so both queues retain their own reason and priority history.
   */
  handleMetallurgMaterialDemand(demand: MetallurgMaterialProcurementDemand): void {
    if (!(demand.requestedUnits > EPSILON)) return;
    const { pack } = this.worldContext;
    const state = pack.states[demand.stateId];
    const destination = getMarketById(demand.destinationMarketId);
    const good = getGoods().find(candidate => candidate.i === demand.goodId);
    if (!state || state.removed || !destination || !good) return;

    const policy = this.getOrCreatePolicy(demand.stateId, [good.i]);
    this.refreshOpenOrderPriority(demand.stateId, destination.i, good.i, "metallurg");
    this.procureExactUnits({
      stateId: demand.stateId,
      destination,
      good,
      requestedUnits: demand.requestedUnits,
      policy,
      purpose: "metallurg"
    });
  }

  /**
   * Removes blocked Metallurg requests that no longer belong to an unfinished State order and
   * collapses historical retries to one request per State, market, and material. Burg tool
   * maintenance deliberately has no public-procurement budget, so retaining its old blocked
   * requests would both misstate military demand and keep save files needlessly large.
   */
  pruneBlockedMetallurgOrders(demands: readonly MetallurgMaterialProcurementDemand[]): void {
    const activeDemandKeys = new Set(
      demands.map(demand => this.getOrderKey(demand.stateId, demand.destinationMarketId, demand.goodId, "metallurg"))
    );
    const retainedOrders: ProcurementOrder[] = [];
    const blockedByKey = new Map<string, ProcurementOrder>();
    let changed = false;

    for (const order of this.getOrders()) {
      if (!hasPurpose(order, "metallurg") || order.status !== "blocked") {
        retainedOrders.push(order);
        continue;
      }

      const key = this.getOrderKey(order.stateId, order.destinationMarketId, order.goodId, "metallurg");
      if (!activeDemandKeys.has(key)) {
        changed = true;
        continue;
      }

      const existing = blockedByKey.get(key);
      if (!existing) {
        blockedByKey.set(key, order);
        retainedOrders.push(order);
        continue;
      }

      // Keep the newest blocked record, carrying forward the largest request and its history.
      const kept = existing.id > order.id ? existing : order;
      const discarded = kept === existing ? order : existing;
      kept.requestedUnits = rn(Math.max(kept.requestedUnits, discarded.requestedUnits), 2);
      kept.priorityCycles = Math.max(kept.priorityCycles ?? 1, discarded.priorityCycles ?? 1);
      if (kept === order) {
        const index = retainedOrders.indexOf(existing);
        retainedOrders[index] = order;
        blockedByKey.set(key, order);
      }
      changed = true;
    }

    if (changed) setStrategicProcurementOrders(retainedOrders);
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
    const assignedUnits = this.getAssignedUnits(stateId, destination.i, good.i, "shipbuilding");
    const remainingUnits = targetStock - destinationStock - assignedUnits;
    if (remainingUnits <= EPSILON) return;

    this.procureUnits({ stateId, destination, good, requestedUnits: remainingUnits, policy, purpose: "shipbuilding" });
  }

  private procureExactUnits({
    stateId,
    destination,
    good,
    requestedUnits,
    policy,
    purpose
  }: {
    stateId: number;
    destination: Market;
    good: Good;
    requestedUnits: number;
    policy: StrategicGoodsPolicy;
    purpose: ProcurementOrderPurpose;
  }): void {
    this.consolidateBlockedOrder(stateId, destination.i, good.i, purpose);
    const assignedUnits = this.getAssignedUnits(stateId, destination.i, good.i, purpose);
    const remainingUnits = requestedUnits - assignedUnits;
    if (remainingUnits <= EPSILON) return;
    this.procureUnits({ stateId, destination, good, requestedUnits: remainingUnits, policy, purpose });
  }

  private getAssignedUnits(
    stateId: number,
    destinationMarketId: number,
    goodId: number,
    purpose: ProcurementOrderPurpose
  ): number {
    return this.getOrders()
      .filter(
        order =>
          order.stateId === stateId &&
          order.destinationMarketId === destinationMarketId &&
          order.goodId === goodId &&
          hasPurpose(order, purpose) &&
          (order.status === "open" || order.status === "assigned" || order.status === "inTransit")
      )
      .reduce((sum, order) => sum + Math.max(0, order.requestedUnits - order.fulfilledUnits), 0);
  }

  private procureUnits({
    stateId,
    destination,
    good,
    requestedUnits,
    policy,
    purpose
  }: {
    stateId: number;
    destination: Market;
    good: Good;
    requestedUnits: number;
    policy: StrategicGoodsPolicy;
    purpose: ProcurementOrderPurpose;
  }): void {
    let remainingUnits = requestedUnits;

    const candidates = this.buildCandidates(destination, good, policy);
    const ranked = rankStrategicProcurementCandidates(candidates, policy.foreignProcurement) as CandidateWithRoute[];
    if (!ranked.length) {
      this.createBlockedOrder({
        stateId,
        destinationMarketId: destination.i,
        goodId: good.i,
        requestedUnits: remainingUnits,
        reason: this.getBlockedReason(candidates, policy.foreignProcurement),
        purpose
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
        sourceMarketId: candidate.sourceMarketId,
        purpose
      });

      const treasury = this.worldContext.pack.states[stateId]?.treasury ?? 0;
      const totalCost = candidate.landedUnitPrice * units;
      if (treasury + EPSILON < totalCost) {
        this.discardOrder(order.id);
        remainingBlockedReason = "insufficientTreasury";
        break;
      }

      const source = getMarketById(candidate.sourceMarketId);
      const sourceGood = source?.goods[good.i];
      if (!source || !sourceGood || sourceGood.stock + EPSILON < units) {
        this.discardOrder(order.id);
        remainingBlockedReason = "noDomesticSupply";
        continue;
      }

      const deal = this.createDeal({
        source,
        destination,
        good,
        units,
        landedUnitPrice: candidate.landedUnitPrice,
        order,
        purpose
      });
      const caravan = Caravans.spawnStrategicProcurement(deal, candidate.route.segments);
      if (!caravan) {
        getDeals().pop();
        this.discardOrder(order.id);
        remainingBlockedReason = "noRoute";
        continue;
      }

      sourceGood.stock = rn(Math.max(0, sourceGood.stock - units), 2);
      markRetailInventoryDirty(source.i);
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
        reason: remainingBlockedReason ?? "noDomesticSupply",
        purpose
      });
    }
  }

  private buildCandidates(destination: Market, good: Good, policy: StrategicGoodsPolicy): CandidateWithRoute[] {
    const { pack } = this.worldContext;
    const mapDiagonal = Math.hypot(this.worldContext.graphWidth, this.worldContext.graphHeight) || 1;
    const candidates: CandidateWithRoute[] = [];

    for (const source of getMarkets()) {
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
        sourceGood.price + sourceGood.price * salesTax + getTransportCost(route.distance, mapDiagonal, good);
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

    const routePath = TradeRoutePlanner.findRoutePath(sourceBurg.cell, destinationBurg.cell);
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
    const policies = getStrategicGoodsPolicies();
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
    const orders = getStrategicProcurementOrders();
    const nextId = getNextStrategicProcurementOrderId();
    setNextStrategicProcurementOrderId(nextId + 1);
    const created: ProcurementOrder = { id: nextId, fulfilledUnits: 0, status: "open", priorityCycles: 1, ...order };
    orders.push(created);
    return created;
  }

  private refreshOpenOrderPriority(
    stateId: number,
    destinationMarketId: number,
    goodId: number,
    purpose: ProcurementOrderPurpose
  ): void {
    for (const order of this.getOrders()) {
      if (
        order.stateId !== stateId ||
        order.destinationMarketId !== destinationMarketId ||
        order.goodId !== goodId ||
        !hasPurpose(order, purpose) ||
        (order.status !== "open" &&
          order.status !== "assigned" &&
          order.status !== "inTransit" &&
          order.status !== "blocked")
      ) {
        continue;
      }
      order.priorityCycles = (order.priorityCycles ?? 1) + 1;
    }
  }

  private createBlockedOrder({
    stateId,
    destinationMarketId,
    goodId,
    requestedUnits,
    reason,
    purpose
  }: {
    stateId: number;
    destinationMarketId: number;
    goodId: number;
    requestedUnits: number;
    reason: ProcurementOrderBlockedReason;
    purpose: ProcurementOrderPurpose;
  }): ProcurementOrder {
    const existing = this.consolidateBlockedOrder(stateId, destinationMarketId, goodId, purpose);
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
      blockedReason: reason,
      purpose
    });
    order.status = "blocked";
    return order;
  }

  private getOrderKey(
    stateId: number,
    destinationMarketId: number,
    goodId: number,
    purpose: ProcurementOrderPurpose
  ): string {
    return `${stateId}:${destinationMarketId}:${goodId}:${purpose}`;
  }

  /** Returns the single retained blocked order for a demand tuple, if one exists. */
  private consolidateBlockedOrder(
    stateId: number,
    destinationMarketId: number,
    goodId: number,
    purpose: ProcurementOrderPurpose
  ): ProcurementOrder | undefined {
    const matches = this.getOrders().filter(
      order =>
        order.stateId === stateId &&
        order.destinationMarketId === destinationMarketId &&
        order.goodId === goodId &&
        hasPurpose(order, purpose) &&
        order.status === "blocked"
    );
    if (!matches.length) return undefined;

    const retained = matches.toSorted((left, right) => right.id - left.id)[0];
    if (matches.length === 1) return retained;

    for (const order of matches) {
      if (order === retained) continue;
      retained.requestedUnits = rn(Math.max(retained.requestedUnits, order.requestedUnits), 2);
      retained.priorityCycles = Math.max(retained.priorityCycles ?? 1, order.priorityCycles ?? 1);
    }
    setStrategicProcurementOrders(this.getOrders().filter(order => !matches.includes(order) || order === retained));
    return retained;
  }

  private discardOrder(orderId: number): void {
    setStrategicProcurementOrders(this.getOrders().filter(order => order.id !== orderId));
  }

  private createDeal({
    source,
    destination,
    good,
    units,
    landedUnitPrice,
    order,
    purpose
  }: {
    source: Market;
    destination: Market;
    good: Good;
    units: number;
    landedUnitPrice: number;
    order: ProcurementOrder;
    purpose: ProcurementOrderPurpose;
  }): Deal {
    const sourceBurg = this.worldContext.pack.burgs[source.centerBurgId];
    const salesTax = sourceBurg?.state ? (this.worldContext.pack.states[sourceBurg.state]?.salesTax ?? 0) : 0;
    const deals = getDeals();
    const deal: Deal = {
      i: deals.length,
      seller: source.i,
      sellerType: "market",
      buyer: destination.i,
      buyerType: "market",
      good: good.i,
      units: rn(units, 2),
      price: rn(landedUnitPrice, 2),
      tax: rn(source.goods[good.i].price * salesTax * units, 2),
      purpose: purpose === "metallurg" ? "metallurgProcurement" : "strategicProcurement",
      payerStateId: order.stateId,
      strategicProcurementOrderId: order.id
    };
    deals.push(deal);
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
