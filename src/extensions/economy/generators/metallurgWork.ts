import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getCaravans,
  getGoods,
  getMarkets,
  getMetallurgAssetLedgers,
  getMetallurgMaterialForecasts,
  getMetallurgNextWorkOrderId,
  getMetallurgWorkOrders,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext,
  setMetallurgAssetLedgers,
  setMetallurgMaterialForecasts,
  setMetallurgNextWorkOrderId,
  setMetallurgWorkOrders
} from "../economyContext";
import type { Good } from "./goodsGeneratorTypes";
import { Markets } from "./markets-generator";
import type {
  MetallurgAssetLedger,
  MetallurgMaterialForecast,
  MetallurgOwnerKind,
  MetallurgWorkOrder,
  MetallurgWorkOrderKind
} from "./metallurgWorkTypes";
import { MilitaryResources } from "./militaryResources";

export interface MetallurgProductionDemand {
  goodId: number;
  outstandingUnits: number;
  /** Maintenance and military replenishment remain visible without monopolizing normal demand. */
  priorityCycles: number;
}

export type {
  MetallurgAssetLedger,
  MetallurgMaterialForecast,
  MetallurgMaterialRequirement,
  MetallurgOwnerKind,
  MetallurgWorkOrder,
  MetallurgWorkOrderKind,
  MetallurgWorkOrderStatus
} from "./metallurgWorkTypes";

const MONTHS_PER_YEAR = 12;
const HOUSEHOLD_PEOPLE = 4;
const TOOLS_PER_HOUSEHOLD = 0.25;
const DURABLE_MAINTENANCE_RATE = 0.006;
const MILITARY_MAINTENANCE_RATE = 0.008;

type ProductPlan = {
  goodName: string;
  units: number;
  kind: MetallurgWorkOrderKind;
  workPerUnit: number;
  materialMultiplier: number;
};

function currentMonthIndex(): number {
  return getSimulationYear() * MONTHS_PER_YEAR + getSimulationMonth() - 1;
}

function ownerKey(ownerKind: MetallurgOwnerKind, ownerId: number, productGoodId: number): string {
  return `${ownerKind}:${ownerId}:${productGoodId}`;
}

function orderKey(
  ownerKind: MetallurgOwnerKind,
  ownerId: number,
  productGoodId: number,
  kind: MetallurgWorkOrderKind
): string {
  return `${ownerKey(ownerKind, ownerId, productGoodId)}:${kind}`;
}

function economicUnitCount(rawCount: number): number {
  return rawCount / Math.max(1, getWorldContext().populationRate || 1);
}

function isArcher(unitName: string): boolean {
  return /archer|bowman|longbow|crossbow/.test(unitName.toLowerCase());
}

function isFirearm(unitName: string): boolean {
  return /arquebus|musketeer|musket|firearm|handgun|gunner/.test(unitName.toLowerCase());
}

function isArtillery(unitName: string): boolean {
  return unitName.toLowerCase() === "artillery";
}

function isMounted(unitName: string): boolean {
  const configured = getWorldContext().options.military?.find(unit => unit.name === unitName);
  return configured?.type === "mounted" || /cavalry|knight|horse/.test(unitName.toLowerCase());
}

function stateForcePlans(state: State): ProductPlan[] {
  let troops = 0;
  let mounted = 0;
  let artillery = 0;
  let archers = 0;
  let firearms = 0;

  for (const regiment of state.military || []) {
    for (const [unitName, rawCount] of Object.entries(regiment.u || {})) {
      const count = economicUnitCount(rawCount);
      troops += count;
      if (isMounted(unitName)) mounted += count;
      if (isArtillery(unitName)) artillery += count;
      if (isArcher(unitName)) archers += count;
      if (isFirearm(unitName)) firearms += count;
    }
  }

  const plans: ProductPlan[] = [
    { goodName: "Arms", units: troops, kind: "newBuild", workPerUnit: 1, materialMultiplier: 1 },
    { goodName: "Harnesses", units: mounted, kind: "newBuild", workPerUnit: 0.7, materialMultiplier: 1 },
    { goodName: "Artillery", units: artillery, kind: "newBuild", workPerUnit: 8, materialMultiplier: 1 },
    {
      goodName: "Arrows",
      units: (archers * 0.05) / MONTHS_PER_YEAR,
      kind: "consumable",
      workPerUnit: 0.2,
      materialMultiplier: 1
    },
    {
      goodName: "Bullets",
      units: (firearms * 0.012) / MONTHS_PER_YEAR,
      kind: "consumable",
      workPerUnit: 0.1,
      materialMultiplier: 1
    }
  ];
  return plans.filter(plan => plan.units > 0);
}

function burgToolsPlan(burg: Burg): ProductPlan | null {
  if (!burg.i || burg.removed || !burg.market) return null;
  const people =
    Math.max(0, burg.population || 0) *
    Math.max(0, getWorldContext().populationRate || 0) *
    Math.max(0, getWorldContext().urbanization || 0);
  const units = (people / HOUSEHOLD_PEOPLE) * TOOLS_PER_HOUSEHOLD;
  return units > 0 ? { goodName: "Tools", units, kind: "newBuild", workPerUnit: 0.8, materialMultiplier: 1 } : null;
}

function materialRequirements(good: Good, recipeIndex: number, units: number, multiplier: number) {
  const recipe = good.recipes?.[recipeIndex] ?? {};
  return Object.entries(recipe)
    .map(([goodId, amount]) => ({ goodId: Number(goodId), units: rn(amount * units * multiplier, 4) }))
    .filter(material => material.units > 0);
}

function syncOrderMaterials(order: MetallurgWorkOrder, good: Good, units: number, materialMultiplier: number): void {
  order.materials = materialRequirements(good, order.recipeIndex, units, materialMultiplier);
}

/**
 * Demand-planning phase of the Metallurg flow. It does not reserve raw materials itself: generic
 * production owns ingredient purchasing, while actual incoming merchant cargo is included in the
 * material forecast as an observable purchase/transport commitment.
 */
export class MetallurgWorkModule {
  generate(): void {
    const goodsByName = new Map(getGoods().map(good => [good.name, good]));
    const assets: MetallurgAssetLedger[] = [];
    const month = currentMonthIndex();

    for (const state of getWorldContext().pack.states) {
      if (!state?.i || state.removed) continue;
      for (const plan of stateForcePlans(state)) {
        if (plan.kind === "consumable") continue;
        const good = goodsByName.get(plan.goodName);
        if (!good) continue;
        assets.push({
          ownerKind: "state",
          ownerId: state.i,
          productGoodId: good.i,
          targetUnits: rn(plan.units, 4),
          serviceableUnits: rn(plan.units, 4),
          maintenanceBacklogWork: 0,
          lastSettledMonth: month - 1
        });
      }
    }

    for (const burg of getWorldContext().pack.burgs) {
      const plan = burgToolsPlan(burg);
      const good = plan && goodsByName.get(plan.goodName);
      if (!plan || !good || !burg.i) continue;
      assets.push({
        ownerKind: "burg",
        ownerId: burg.i,
        productGoodId: good.i,
        targetUnits: rn(plan.units, 4),
        serviceableUnits: rn(plan.units, 4),
        maintenanceBacklogWork: 0,
        lastSettledMonth: month - 1
      });
    }

    setMetallurgAssetLedgers(assets);
    setMetallurgWorkOrders([]);
    setMetallurgMaterialForecasts([]);
    setMetallurgNextWorkOrderId(1);
  }

  clear(): void {
    setMetallurgAssetLedgers([]);
    setMetallurgWorkOrders([]);
    setMetallurgMaterialForecasts([]);
    setMetallurgNextWorkOrderId(0);
  }

  /** Reconciles one month of new demand and leaves fulfillment for Phase 2. */
  settleMonthly(): boolean {
    const month = currentMonthIndex();
    const assets = getMetallurgAssetLedgers();
    if (assets.length && assets.every(asset => asset.lastSettledMonth >= month)) return false;

    const goodsByName = new Map(getGoods().map(good => [good.name, good]));
    const goodsById = new Map(getGoods().map(good => [good.i, good]));
    const marketByState = this.getMarketByState();
    const marketByBurg = new Map(
      getWorldContext()
        .pack.burgs.filter(burg => burg?.i && burg.market)
        .map(burg => [burg.i!, burg.market!])
    );
    const assetByKey = new Map(
      assets.map(asset => [ownerKey(asset.ownerKind, asset.ownerId, asset.productGoodId), asset])
    );
    const nextAssets = [...assets];
    const orders = [...getMetallurgWorkOrders()];
    const ordersByKey = new Map(
      orders.map(order => [orderKey(order.ownerKind, order.ownerId, order.productGoodId, order.kind), order])
    );
    let nextOrderId = getMetallurgNextWorkOrderId();

    const appendOrder = (
      ownerKind: MetallurgOwnerKind,
      ownerId: number,
      destinationMarketId: number,
      plan: ProductPlan,
      units: number,
      materialMultiplier: number
    ) => {
      const good = goodsByName.get(plan.goodName);
      if (!good || units <= 0 || destinationMarketId <= 0) return;
      const key = orderKey(ownerKind, ownerId, good.i, plan.kind);
      const existing = ordersByKey.get(key);
      if (existing) {
        existing.requestedUnits = rn(existing.requestedUnits + units, 4);
        existing.plannedWork = rn(existing.plannedWork + units * plan.workPerUnit, 4);
        syncOrderMaterials(existing, good, existing.requestedUnits - existing.completedUnits, materialMultiplier);
        existing.updatedMonth = month;
        return;
      }
      const order: MetallurgWorkOrder = {
        id: nextOrderId++,
        ownerKind,
        ownerId,
        destinationMarketId,
        productGoodId: good.i,
        kind: plan.kind,
        recipeIndex: 0,
        requestedUnits: rn(units, 4),
        completedUnits: 0,
        plannedWork: rn(units * plan.workPerUnit, 4),
        completedWork: 0,
        materials: materialRequirements(good, 0, units, materialMultiplier),
        status: "queued",
        createdMonth: month,
        updatedMonth: month
      };
      orders.push(order);
      ordersByKey.set(key, order);
    };

    for (const state of getWorldContext().pack.states) {
      if (!state?.i || state.removed) continue;
      const marketId = marketByState.get(state.i);
      if (!marketId) continue;
      for (const plan of stateForcePlans(state)) {
        const good = goodsByName.get(plan.goodName);
        if (!good) continue;
        if (plan.kind === "consumable") {
          appendOrder("state", state.i, marketId, plan, plan.units, plan.materialMultiplier);
          continue;
        }

        const key = ownerKey("state", state.i, good.i);
        const asset = assetByKey.get(key);
        if (!asset) {
          const seeded: MetallurgAssetLedger = {
            ownerKind: "state",
            ownerId: state.i,
            productGoodId: good.i,
            targetUnits: 0,
            serviceableUnits: 0,
            maintenanceBacklogWork: 0,
            lastSettledMonth: month - 1
          };
          nextAssets.push(seeded);
          assetByKey.set(key, seeded);
        }
        const current = assetByKey.get(key)!;
        const outstanding = ordersByKey.get(orderKey("state", state.i, good.i, "newBuild"));
        const plannedUnits = outstanding ? Math.max(0, outstanding.requestedUnits - outstanding.completedUnits) : 0;
        const addedUnits = Math.max(0, plan.units - current.serviceableUnits - plannedUnits);
        if (addedUnits > 0) appendOrder("state", state.i, marketId, plan, addedUnits, 1);
        current.targetUnits = rn(plan.units, 4);
        current.maintenanceBacklogWork = rn(current.maintenanceBacklogWork + plan.units * MILITARY_MAINTENANCE_RATE, 4);
        const maintenanceUnits = plan.units * MILITARY_MAINTENANCE_RATE;
        appendOrder("state", state.i, marketId, { ...plan, kind: "maintenance" }, maintenanceUnits, 0.18);
        current.lastSettledMonth = month;
      }
    }

    for (const burg of getWorldContext().pack.burgs) {
      const plan = burgToolsPlan(burg);
      if (!plan || !burg.i) continue;
      const good = goodsByName.get(plan.goodName);
      const marketId = marketByBurg.get(burg.i);
      if (!good || !marketId) continue;
      const key = ownerKey("burg", burg.i, good.i);
      const asset = assetByKey.get(key);
      if (!asset) continue;
      const outstanding = ordersByKey.get(orderKey("burg", burg.i, good.i, "newBuild"));
      const plannedUnits = outstanding ? Math.max(0, outstanding.requestedUnits - outstanding.completedUnits) : 0;
      const addedUnits = Math.max(0, plan.units - asset.serviceableUnits - plannedUnits);
      if (addedUnits > 0) appendOrder("burg", burg.i, marketId, plan, addedUnits, 1);
      asset.targetUnits = rn(plan.units, 4);
      asset.maintenanceBacklogWork = rn(asset.maintenanceBacklogWork + plan.units * DURABLE_MAINTENANCE_RATE, 4);
      appendOrder(
        "burg",
        burg.i,
        marketId,
        { ...plan, kind: "maintenance" },
        plan.units * DURABLE_MAINTENANCE_RATE,
        0.15
      );
      asset.lastSettledMonth = month;
    }

    const forecasts = this.buildMaterialForecasts(orders, goodsById);
    const forecastByOrder = new Map<number, boolean>();
    for (const forecast of forecasts) {
      for (const orderId of forecast.workOrderIds) {
        if (forecast.projectedShortage > 0) forecastByOrder.set(orderId, true);
      }
    }
    for (const order of orders) {
      if (order.completedUnits >= order.requestedUnits) order.status = "completed";
      else order.status = forecastByOrder.get(order.id) ? "waitingMaterials" : "queued";
    }

    setMetallurgAssetLedgers(nextAssets);
    setMetallurgWorkOrders(orders);
    setMetallurgMaterialForecasts(forecasts);
    setMetallurgNextWorkOrderId(nextOrderId);
    return true;
  }

  getMaterialForecasts(): readonly MetallurgMaterialForecast[] {
    return getMetallurgMaterialForecasts();
  }

  /** Re-reads stock and live cargo without creating another month's worth of work. */
  refreshMaterialForecasts(): void {
    const goodsById = new Map(getGoods().map(good => [good.i, good]));
    setMetallurgMaterialForecasts(this.buildMaterialForecasts(getMetallurgWorkOrders(), goodsById));
  }

  /**
   * Converts unfinished local orders into the same demand signal used by strategic production.
   * This is deliberately a read-only adapter: generic production still owns worker allocation,
   * recipes, ingredient purchasing, and finished-Good market delivery.
   */
  getProductionDemandByGood(marketId: number): ReadonlyMap<number, MetallurgProductionDemand> {
    const demandByGood = new Map<number, MetallurgProductionDemand>();
    for (const order of getMetallurgWorkOrders()) {
      if (order.destinationMarketId !== marketId || order.status === "completed") continue;
      const outstandingUnits = Math.max(0, order.requestedUnits - order.completedUnits);
      if (outstandingUnits <= 0.001) continue;
      const priorityCycles = order.kind === "maintenance" || order.ownerKind === "state" ? 2 : 1;
      const existing = demandByGood.get(order.productGoodId);
      if (existing) {
        existing.outstandingUnits += outstandingUnits;
        existing.priorityCycles = Math.max(existing.priorityCycles, priorityCycles);
      } else {
        demandByGood.set(order.productGoodId, { goodId: order.productGoodId, outstandingUnits, priorityCycles });
      }
    }
    return demandByGood;
  }

  /**
   * Transfers finished market Goods into open orders after generic production has run. This is
   * the single completion path for Arms, Arrows, and Bullets; MilitaryResources therefore only
   * consumes their non-forge operational inputs and cannot double-consume finished equipment.
   */
  fulfillFromMarkets(): boolean {
    const orders = getMetallurgWorkOrders();
    const assets = getMetallurgAssetLedgers();
    const assetsByKey = new Map(
      assets.map(asset => [ownerKey(asset.ownerKind, asset.ownerId, asset.productGoodId), asset])
    );
    let changed = false;

    for (const order of orders.toSorted((left, right) => {
      const leftPriority = left.ownerKind === "state" ? 1 : 0;
      const rightPriority = right.ownerKind === "state" ? 1 : 0;
      return rightPriority - leftPriority || left.id - right.id;
    })) {
      if (order.status === "completed") continue;
      const outstandingUnits = Math.max(0, order.requestedUnits - order.completedUnits);
      if (outstandingUnits <= 0.001) continue;
      const delivered = Markets.consumeForMetallurg(
        order.destinationMarketId,
        order.productGoodId,
        outstandingUnits,
        order.ownerKind === "state" ? "military" : "burgDemand"
      );
      if (!(delivered > 0)) continue;

      const workPerUnit = order.requestedUnits > 0 ? order.plannedWork / order.requestedUnits : 0;
      order.completedUnits = rn(Math.min(order.requestedUnits, order.completedUnits + delivered), 4);
      order.completedWork = rn(Math.min(order.plannedWork, order.completedWork + delivered * workPerUnit), 4);
      order.status = order.completedUnits >= order.requestedUnits - 0.001 ? "completed" : "inProgress";
      order.updatedMonth = currentMonthIndex();

      const asset = assetsByKey.get(ownerKey(order.ownerKind, order.ownerId, order.productGoodId));
      if (asset) {
        if (order.kind === "newBuild" || order.kind === "replacement") {
          asset.serviceableUnits = rn(Math.min(asset.targetUnits, asset.serviceableUnits + delivered), 4);
        }
        if (order.kind === "maintenance") {
          asset.maintenanceBacklogWork = rn(Math.max(0, asset.maintenanceBacklogWork - delivered * workPerUnit), 4);
        }
      }
      if (order.ownerKind === "state") {
        const good = getGoods().find(candidate => candidate.i === order.productGoodId);
        if (good) MilitaryResources.recordFinishedGoodsDelivery(order.ownerId, good.name, delivered);
      }
      changed = true;
    }

    if (changed) {
      setMetallurgWorkOrders(orders);
      setMetallurgAssetLedgers(assets);
    }
    return changed;
  }

  private getMarketByState(): Map<number, number> {
    const candidates = new Map<number, Array<{ marketId: number; population: number }>>();
    for (const market of getMarkets()) {
      const burg = getWorldContext().pack.burgs[market.centerBurgId];
      if (!burg?.state) continue;
      const list = candidates.get(burg.state) ?? [];
      list.push({ marketId: market.i, population: burg.population ?? 0 });
      candidates.set(burg.state, list);
    }
    return new Map(
      Array.from(candidates, ([stateId, markets]) => [
        stateId,
        markets.toSorted((left, right) => right.population - left.population || left.marketId - right.marketId)[0]
          .marketId
      ])
    );
  }

  private buildMaterialForecasts(
    orders: readonly MetallurgWorkOrder[],
    goodsById: ReadonlyMap<number, Good>
  ): MetallurgMaterialForecast[] {
    const forecasts = new Map<string, MetallurgMaterialForecast>();
    const marketById = new Map(getMarkets().map(market => [market.i, market]));
    const inboundByMarketAndGood = new Map<string, number>();
    for (const caravan of getCaravans()) {
      if (caravan.state !== "transit" || caravan.buyerType !== "market") continue;
      for (const payload of caravan.payload) {
        const key = `${caravan.buyer}:${payload.goodId}`;
        inboundByMarketAndGood.set(key, (inboundByMarketAndGood.get(key) ?? 0) + payload.units);
      }
    }
    for (const order of orders) {
      if (order.status === "completed") continue;
      for (const material of order.materials) {
        if (!goodsById.has(material.goodId)) continue;
        const key = `${order.destinationMarketId}:${material.goodId}`;
        const existing = forecasts.get(key);
        if (existing) {
          existing.requiredUnits = rn(existing.requiredUnits + material.units, 4);
          existing.workOrderIds.push(order.id);
          continue;
        }
        const market = marketById.get(order.destinationMarketId);
        const stock = market?.goods[material.goodId]?.stock ?? 0;
        forecasts.set(key, {
          marketId: order.destinationMarketId,
          goodId: material.goodId,
          requiredUnits: rn(material.units, 4),
          availableMarketStock: rn(stock, 4),
          inboundUnits: rn(inboundByMarketAndGood.get(key) ?? 0, 4),
          projectedShortage: 0,
          workOrderIds: [order.id]
        });
      }
    }
    for (const forecast of forecasts.values()) {
      forecast.projectedShortage = rn(
        Math.max(0, forecast.requiredUnits - forecast.availableMarketStock - forecast.inboundUnits),
        4
      );
    }
    return Array.from(forecasts.values()).toSorted(
      (left, right) => left.marketId - right.marketId || left.goodId - right.goodId
    );
  }
}

export const MetallurgWork = new MetallurgWorkModule();
