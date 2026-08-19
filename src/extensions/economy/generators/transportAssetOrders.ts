import { rn } from "../../hostUtils";
import {
  getCraftDomainEmploymentRecords,
  getGoods,
  getMarketById,
  getMarkets,
  getNextTransportAssetOrderId,
  getTransportAssetOrders,
  getWorldContext,
  setNextTransportAssetOrderId,
  setTransportAssetOrders
} from "../economyContext";
import { getEconomyCalibrationState } from "../store/economyCalibrationState";
import { laborPeople, peopleToPoints } from "./craftScale";
import { getGuildBonus } from "./guildKnowledge";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import type { MerchantLandAssetBalance, TransportAssetOrder } from "./marketTypes";
import { MerchantTransportAssets } from "./merchantTransportAssets";

export type TransportAssetBlueprint = {
  id: TransportAssetOrder["blueprintId"];
  outputAssetId: MerchantLandAssetBalance["assetId"] | "river-barge";
  outputMode: "land" | "river";
  materialNames: Readonly<Record<string, number>>;
  requiredWorkPoints: number;
  requiredCraft: CraftKnowledgeDomain;
  cargoCapacitySlots: number;
  requiredDraftAnimals?: number;
};

const BLUEPRINTS: readonly TransportAssetBlueprint[] = [
  {
    id: "pack-train",
    outputAssetId: "pack-train",
    outputMode: "land",
    materialNames: { Leather: 1, Harnesses: 1 },
    requiredWorkPoints: 2,
    requiredCraft: "leather",
    cargoCapacitySlots: 40,
    requiredDraftAnimals: 1
  },
  {
    id: "cart",
    outputAssetId: "cart",
    outputMode: "land",
    materialNames: { Wood: 3, Harnesses: 1 },
    requiredWorkPoints: 4,
    requiredCraft: "woodworking",
    cargoCapacitySlots: 80,
    requiredDraftAnimals: 1
  },
  {
    id: "wagon",
    outputAssetId: "wagon",
    outputMode: "land",
    materialNames: { Wood: 6, Harnesses: 2 },
    requiredWorkPoints: 8,
    requiredCraft: "woodworking",
    cargoCapacitySlots: 180,
    requiredDraftAnimals: 2
  },
  {
    id: "river-barge",
    outputAssetId: "river-barge",
    outputMode: "river",
    materialNames: { Wood: 5, Ropes: 1, Tar: 1 },
    requiredWorkPoints: 6,
    requiredCraft: "woodworking",
    cargoCapacitySlots: 160
  }
];

const WORK_SHARE_OF_OBSERVED_CRAFT_EMPLOYMENT = 0.25;
/**
 * Dedicated real-people capacity for transport-asset construction (docs/plan/
 * craft-demand-calibration.md Key Decision 10 / §2.0 P2). Replaces the legacy "25% of observed
 * guild-craft employment" capacity once applyCalibration is on — carts/wagons/barges are excluded
 * from guild-craft practitioner counting entirely, so they get their own small, self-contained
 * labor pool instead of borrowing from woodworking's population-point figure.
 */
const TRANSPORT_CRAFT_PEOPLE_PER_THOUSAND = 1.5;

type PlannedWork = { orderId: number; workPoints: number; domain: CraftKnowledgeDomain };

function getBlueprint(id: TransportAssetOrder["blueprintId"]): TransportAssetBlueprint {
  const blueprint = BLUEPRINTS.find(candidate => candidate.id === id);
  if (!blueprint) throw new Error(`[economy] Unknown transport asset blueprint: ${id}`);
  return blueprint;
}

function requiredMaterials(blueprint: TransportAssetBlueprint, quantity: number): Record<number, number> | null {
  const goods = getGoods();
  const materials: Record<number, number> = {};
  for (const [name, perAsset] of Object.entries(blueprint.materialNames)) {
    const good = goods.find(candidate => candidate.name === name);
    if (!good) return null;
    materials[good.i] = perAsset * quantity;
  }
  return materials;
}

function getMarketTreasury(market: NonNullable<ReturnType<typeof getMarketById>>) {
  const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
  market.marketTreasury = treasury;
  return treasury;
}

/**
 * Owns durable transport-asset order state, atomic material funding, and work allocation.
 * Production sees only the planned worker points for each Burg, keeping its interface small.
 */
export class TransportAssetOrdersModule {
  private plannedWorkByBurg = new Map<number, PlannedWork[]>();

  getBlueprints(): readonly TransportAssetBlueprint[] {
    return BLUEPRINTS;
  }

  getOrders(marketId?: number): readonly TransportAssetOrder[] {
    const orders = getTransportAssetOrders();
    return marketId === undefined ? orders : orders.filter(order => order.marketId === marketId);
  }

  createOrder({
    marketId,
    blueprintId,
    quantity,
    requestedBy = "simulation",
    budgetLimit
  }: {
    marketId: number;
    blueprintId: TransportAssetOrder["blueprintId"];
    quantity: number;
    requestedBy?: TransportAssetOrder["requestedBy"];
    budgetLimit?: number;
  }): TransportAssetOrder | null {
    if (
      !getMarketById(marketId) ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      (budgetLimit !== undefined && (!Number.isFinite(budgetLimit) || budgetLimit < 0))
    ) {
      return null;
    }
    const order: TransportAssetOrder = {
      id: getNextTransportAssetOrderId() + 1,
      marketId,
      requestedBy,
      blueprintId,
      quantity,
      completedQuantity: 0,
      budgetLimit,
      fundedAmount: 0,
      reservedMaterials: {},
      workPoints: 0,
      status: "queued"
    };
    setNextTransportAssetOrderId(order.id);
    const orders = getTransportAssetOrders();
    orders.push(order);
    setTransportAssetOrders(orders);
    return order;
  }

  cancel(orderId: number): boolean {
    const order = getTransportAssetOrders().find(candidate => candidate.id === orderId);
    if (!order || order.status === "completed" || order.status === "cancelled") return false;
    const market = getMarketById(order.marketId);
    if (market) {
      for (const [goodId, units] of Object.entries(order.reservedMaterials)) {
        if (!(units > 0)) continue;
        const id = +goodId;
        const row = market.goods[id];
        if (row) row.stock = rn(row.stock + units, 4);
      }
    }
    order.reservedMaterials = {};
    order.status = "cancelled";
    order.blockedReason = undefined;
    setTransportAssetOrders(getTransportAssetOrders());
    return true;
  }

  /** Called once at the start of each production cycle, before recipe workers are chosen. */
  beginProductionCycle(): void {
    this.plannedWorkByBurg.clear();
    this.queueSimulationReplenishment();
    for (const order of this.getOrdersByPriority()) this.fundOrder(order);
    this.planCraftWork();
  }

  /** Reserves an already-planned worker share from a Burg's generic recipe-worker budget. */
  consumePlannedWork(
    burgId: number,
    population: number
  ): { total: number; byDomain: Map<CraftKnowledgeDomain, number> } {
    const planned = this.plannedWorkByBurg.get(burgId) ?? [];
    const byDomain = new Map<CraftKnowledgeDomain, number>();

    if (getEconomyCalibrationState().applyCalibration) {
      // planCraftWork() already bounded each entry's workPoints by this burg's dedicated
      // real-people transport capacity (TRANSPORT_CRAFT_PEOPLE_PER_THOUSAND), so every planned
      // entry is consumed in full here — no further population(points)-based cap. The people total
      // is converted back to population points only for the caller's production-labor budget.
      const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
      let peopleConsumed = 0;
      for (const entry of planned) {
        const allocated = Math.max(0, entry.workPoints);
        if (!(allocated > 0)) continue;
        peopleConsumed += allocated;
        byDomain.set(entry.domain, (byDomain.get(entry.domain) ?? 0) + allocated);
        this.applyWork(entry.orderId, allocated, entry.domain, burgId);
      }
      return { total: peopleToPoints(peopleConsumed, populationRate), byDomain };
    }

    let total = 0;
    for (const entry of planned) {
      if (total >= population) break;
      const allocated = Math.min(entry.workPoints, Math.max(0, population - total));
      if (!(allocated > 0)) continue;
      total += allocated;
      byDomain.set(entry.domain, (byDomain.get(entry.domain) ?? 0) + allocated);
      this.applyWork(entry.orderId, allocated, entry.domain, burgId);
    }
    return { total, byDomain };
  }

  clear(): void {
    this.plannedWorkByBurg.clear();
    setTransportAssetOrders([]);
    setNextTransportAssetOrderId(0);
  }

  private queueSimulationReplenishment(): void {
    for (const market of getMarkets()) {
      const ledger = MerchantTransportAssets.ensureLedger(market.i);
      if (!ledger) continue;
      for (const balance of ledger.landAssets) {
        // Maintenance is a concrete capacity loss. Keep one replacement order active until it is covered.
        const outstanding = getTransportAssetOrders()
          .filter(
            order =>
              order.marketId === market.i &&
              order.blueprintId === balance.assetId &&
              order.requestedBy === "simulation" &&
              order.status !== "completed" &&
              order.status !== "cancelled"
          )
          .reduce((sum, order) => sum + order.quantity - order.completedQuantity, 0);
        const missing = Math.max(0, Math.ceil(balance.maintenance) - outstanding);
        if (missing > 0) this.createOrder({ marketId: market.i, blueprintId: balance.assetId, quantity: missing });
      }
    }
  }

  private fundOrder(order: TransportAssetOrder): void {
    if (order.status !== "queued" && order.status !== "waitingMaterials") return;
    const market = getMarketById(order.marketId);
    const materials = requiredMaterials(getBlueprint(order.blueprintId), order.quantity);
    if (!market || !materials) {
      order.status = "waitingMaterials";
      order.blockedReason = "missingMaterials";
      return;
    }
    const costs = Object.entries(materials).map(([goodId, units]) => {
      const row = market.goods[+goodId];
      return { goodId: +goodId, units, row, cost: (row?.price ?? 0) * units };
    });
    if (costs.some(item => !item.row || item.row.stock + 0.0001 < item.units)) {
      order.status = "waitingMaterials";
      order.blockedReason = "missingMaterials";
      return;
    }
    const totalCost = costs.reduce((sum, item) => sum + item.cost, 0);
    if (order.budgetLimit !== undefined && totalCost > order.budgetLimit + 0.0001) {
      order.status = "waitingMaterials";
      order.blockedReason = "budgetLimit";
      return;
    }
    const treasury = getMarketTreasury(market);
    if (treasury.balance + 0.0001 < totalCost) {
      order.status = "waitingMaterials";
      order.blockedReason = "insufficientTreasury";
      return;
    }
    for (const item of costs) item.row!.stock = rn(Math.max(0, item.row!.stock - item.units), 4);
    treasury.balance = rn(Math.max(0, treasury.balance - totalCost), 2);
    order.reservedMaterials = materials;
    order.fundedAmount = rn(totalCost, 2);
    order.status = "building";
    order.blockedReason = undefined;
  }

  private planCraftWork(): void {
    const applyCalibration = getEconomyCalibrationState().applyCalibration;
    const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;

    // Legacy (applyCalibration off): capacity is 25% of observed guild-craft employment.
    const observed = new Map<string, number>();
    if (!applyCalibration) {
      for (const record of getCraftDomainEmploymentRecords())
        observed.set(`${record.burgId}:${record.domain}`, record.workers);
    }
    // applyCalibration on: capacity is a dedicated real-people pool sized off each burg's own
    // population, independent of guild-craft employment (Key Decision 10).
    const burgPopulationById = new Map<number, number>();
    if (applyCalibration) {
      for (const burg of getWorldContext().pack.burgs) {
        if (burg?.i && !burg.removed) burgPopulationById.set(burg.i, burg.population ?? 0);
      }
    }

    const assigned = new Map<string, number>();
    const orders = this.getOrdersByPriority().filter(order => order.status === "building");
    for (const order of orders) {
      order.blockedReason = undefined;
      const blueprint = getBlueprint(order.blueprintId);
      const remaining = Math.max(0, blueprint.requiredWorkPoints * order.quantity - order.workPoints);
      if (!(remaining > 0)) continue;
      let unassigned = remaining;
      const burgIds = getWorldContext()
        .pack.burgs.reduce<number[]>((ids, burg) => {
          if (!burg.removed && burg.market === order.marketId && typeof burg.i === "number" && burg.i > 0) {
            ids.push(burg.i);
          }
          return ids;
        }, [])
        .toSorted((left, right) => left - right);
      for (const burgId of burgIds) {
        if (!(unassigned > 0)) break;
        const key = `${burgId}:${blueprint.requiredCraft}`;
        const capacity = applyCalibration
          ? (laborPeople(burgPopulationById.get(burgId) ?? 0, populationRate) / 1000) *
            TRANSPORT_CRAFT_PEOPLE_PER_THOUSAND
          : (observed.get(key) ?? 0) * WORK_SHARE_OF_OBSERVED_CRAFT_EMPLOYMENT;
        const remainingCapacity = Math.max(0, capacity - (assigned.get(key) ?? 0));
        const workPoints = Math.min(unassigned, remainingCapacity);
        if (!(workPoints > 0)) continue;
        const planned = this.plannedWorkByBurg.get(burgId) ?? [];
        planned.push({ orderId: order.id, workPoints, domain: blueprint.requiredCraft });
        this.plannedWorkByBurg.set(burgId, planned);
        assigned.set(key, (assigned.get(key) ?? 0) + workPoints);
        unassigned -= workPoints;
      }
      if (unassigned > 0) order.blockedReason = "missingCraftWorkers";
    }
  }

  private getOrdersByPriority(): TransportAssetOrder[] {
    return [...getTransportAssetOrders()].toSorted((left, right) => {
      const priority = Number(right.requestedBy === "player") - Number(left.requestedBy === "player");
      return priority || left.id - right.id;
    });
  }

  private applyWork(orderId: number, workPoints: number, domain: CraftKnowledgeDomain, burgId: number): void {
    const order = getTransportAssetOrders().find(candidate => candidate.id === orderId);
    if (order?.status !== "building") return;
    order.workPoints = rn(order.workPoints + workPoints * getGuildBonus(burgId, domain), 4);
    order.blockedReason = undefined;
    const blueprint = getBlueprint(order.blueprintId);
    const completed = Math.min(order.quantity, Math.floor(order.workPoints / blueprint.requiredWorkPoints));
    const newlyCompleted = completed - order.completedQuantity;
    if (newlyCompleted > 0) {
      if (blueprint.outputMode === "land") {
        MerchantTransportAssets.addAvailableLandAssets(
          order.marketId,
          blueprint.outputAssetId as MerchantLandAssetBalance["assetId"],
          newlyCompleted
        );
      } else {
        MerchantTransportAssets.addAvailableRiverAssets(order.marketId, newlyCompleted);
      }
      for (const [goodId, reserved] of Object.entries(order.reservedMaterials)) {
        order.reservedMaterials[+goodId] = rn(
          Math.max(0, reserved - (requiredMaterials(blueprint, newlyCompleted)?.[+goodId] ?? 0)),
          4
        );
      }
      order.completedQuantity = completed;
    }
    if (order.completedQuantity === order.quantity) {
      order.status = "completed";
      order.reservedMaterials = {};
      order.blockedReason = undefined;
    }
    setTransportAssetOrders(getTransportAssetOrders());
  }
}

export const TransportAssetOrders = new TransportAssetOrdersModule();
