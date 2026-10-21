import { simEvents } from "../../../simulation/events";
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
import { getEconomyCalibrationState } from "../state/economyCalibrationStore";
import { creditHouseholdWealth } from "./burgMarketLedgers";
import { HARNESS_SETS_PER_LOT } from "./craftDemandCalibration";
import { DEFAULT_PEOPLE_PER_POPULATION_POINT, laborPeople, peopleToPoints } from "./craftScale";
import { getGuildBonus } from "./guildKnowledge";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import { creditRuralHouseholdWealth } from "./householdWealth";
import { HORSES_PER_MARKET_HEAD } from "./liveAnimalScale";
import { getMarketRuralPopulation } from "./marketPopulation";
import type { Caravan, Market, MerchantLandAssetBalance, TransportAssetOrder } from "./marketTypes";
import { getUncommittedTradeCapital } from "./merchantTradeCapital";
import { computeLandFleetNeedCounts, MerchantTransportAssets, RIVER_BARGE_WOOD_UNITS } from "./merchantTransportAssets";
import { getSubsistenceWage } from "./subsistenceWage";
import { getLandTransportDefinition, RIVER_BARGE_TRANSPORT } from "./tradeCargo";

export type TransportAssetBlueprint = {
  id: TransportAssetOrder["blueprintId"];
  outputAssetId: MerchantLandAssetBalance["assetId"] | "river-barge";
  outputMode: "land" | "river";
  materialNames: Readonly<Record<string, number>>;
  /** Used when the market has them in stock; otherwise the craft is built without (e.g. withies for rope). */
  optionalMaterialNames?: Readonly<Record<string, number>>;
  /**
   * Plainer builds used when the market lacks the usual materials: harness of plain leather with
   * wooden hames instead of a smith's fitted harness, as carters and peasants made their own
   * (port-freight-queue-and-warehouses.md §10.11).
   */
  substituteMaterialNames?: readonly Readonly<Record<string, number>>[];
  requiredWorkPoints: number;
  /** Horses bought with the convoy, in market heads (HORSES_PER_MARKET_HEAD animals each, §10.17). */
  draftAnimalHeads?: number;
  requiredCraft: CraftKnowledgeDomain;
  cargoCapacitySlots: number;
  requiredDraftAnimals?: number;
};

/** Beasts in one convoy of `assetId` (tradeCargo.ts). */
function convoyAnimals(assetId: MerchantLandAssetBalance["assetId"]): number {
  return getLandTransportDefinition(assetId)?.convoyDraftAnimals ?? 0;
}

/** Slots and draft-animal teams of `assetId`, from the one definition trade cargo uses. */
function landCapacity(
  assetId: MerchantLandAssetBalance["assetId"]
): Pick<TransportAssetBlueprint, "cargoCapacitySlots" | "requiredDraftAnimals"> {
  const definition = getLandTransportDefinition(assetId);
  return {
    cargoCapacitySlots: definition?.cargoCapacitySlots ?? 0,
    requiredDraftAnimals: definition?.requiredDraftAnimals
  };
}

/*
 * One land vehicle is a convoy: a cart's 80 slots hold 20 wains of grain, some 12 t, the load of
 * about twenty one-horse carts; a wagon's 160 slots twenty wagons with some sixty horses; a pack
 * train's 36 slots fifty pack horses (port-freight-queue-and-warehouses.md §10.13, §10.15). The
 * materials and work are for the whole convoy: a one-horse cart took a wheelwright and his men
 * about 15-20 days, a four-wheeled wagon 40-60, a pack saddle two or three. Wood is 10 m³ of
 * roundwood a unit (`WOOD_M3_PER_UNIT`), half of it sawn timber: a one-horse cart is some 0.35 m³ of
 * timber, a wagon 1 m³, a pack-saddle tree a hundredth of that (goods-physical-units.md §4.1). A horse
 * needs a set of harness (HARNESS_SETS_PER_LOT to a lot) and is bought in market
 * heads (HORSES_PER_MARKET_HEAD to a head, §10.17).
 */
const BLUEPRINTS: readonly TransportAssetBlueprint[] = [
  {
    id: "pack-train",
    outputAssetId: "pack-train",
    outputMode: "land",
    // Fifty pack saddles on wooden trees, with halters, girths and breeching.
    materialNames: { Leather: 0.5, Wood: 0.1, Harnesses: convoyAnimals("pack-train") / HARNESS_SETS_PER_LOT },
    substituteMaterialNames: [{ Leather: 1, Wood: 0.1 }],
    requiredWorkPoints: 5,
    draftAnimalHeads: convoyAnimals("pack-train") / HORSES_PER_MARKET_HEAD,
    requiredCraft: "leather",
    ...landCapacity("pack-train")
  },
  {
    id: "cart",
    outputAssetId: "cart",
    outputMode: "land",
    materialNames: { Wood: 1.5, Harnesses: convoyAnimals("cart") / HARNESS_SETS_PER_LOT },
    substituteMaterialNames: [{ Wood: 1.5, Leather: 0.2 }],
    requiredWorkPoints: 12,
    draftAnimalHeads: convoyAnimals("cart") / HORSES_PER_MARKET_HEAD,
    requiredCraft: "woodworking",
    ...landCapacity("cart")
  },
  {
    id: "wagon",
    outputAssetId: "wagon",
    outputMode: "land",
    materialNames: { Wood: 4, Harnesses: convoyAnimals("wagon") / HARNESS_SETS_PER_LOT },
    substituteMaterialNames: [{ Wood: 4, Leather: 0.6 }],
    requiredWorkPoints: 40,
    draftAnimalHeads: convoyAnimals("wagon") / HORSES_PER_MARKET_HEAD,
    requiredCraft: "woodworking",
    ...landCapacity("wagon")
  },
  {
    id: "river-barge",
    outputAssetId: "river-barge",
    outputMode: "river",
    // Plank-built and caulked; a raft-like one-way craft can be bound with withies and left
    // unpitched, so rope and tar are used only where the market has them.
    materialNames: { Wood: RIVER_BARGE_WOOD_UNITS },
    optionalMaterialNames: { Ropes: 1, Tar: 1 },
    requiredWorkPoints: 6,
    requiredCraft: "woodworking",
    cargoCapacitySlots: RIVER_BARGE_TRANSPORT.cargoCapacitySlots
  }
];

const WORK_SHARE_OF_OBSERVED_CRAFT_EMPLOYMENT = 0.25;
/** The draft animals a convoy is bought with; they go back to the market when it is let go. */
const DRAFT_ANIMAL_GOOD_NAME = "Horses";
/** Cycles in a row a market must hire a kind before it orders its own for the least it hired. */
const SUSTAINED_HIRE_CYCLES = 3;
/** Days between production cycles, over which hired vehicle-days are averaged. */
const PRODUCTION_CYCLE_DAYS = 30;
/**
 * Dedicated real-people capacity for transport-asset construction (docs/plan/
 * craft-demand-calibration.md Key Decision 10 / §2.0 P2). Replaces the legacy "25% of observed
 * guild-craft employment" capacity once applyCalibration is on — carts/wagons/barges are excluded
 * from guild-craft practitioner counting entirely, so they get their own small, self-contained
 * labor pool instead of borrowing from woodworking's population-point figure.
 */
const TRANSPORT_CRAFT_PEOPLE_PER_THOUSAND = 1.5;
/**
 * Village wheelwrights and saddlers, per thousand of the market's rural people, who build for the
 * carriers when the town's are busy. Most of a village wright's work was the farmers' own carts and
 * ploughs; this is the share left for merchants' convoys (port-freight-queue-and-warehouses.md
 * §10.16). England had one wheelwright to some 37 farm horses in 1871; at that rate the carriers'
 * twenty beasts per thousand would keep half a wright, the town's wrights build the rest (§10.26).
 * With calibration only: the town pool is in real people there.
 */
const RURAL_TRANSPORT_CRAFT_PEOPLE_PER_THOUSAND = 0.3;

type PlannedWork = { orderId: number; workPoints: number; domain: CraftKnowledgeDomain };

/**
 * Where a market's ordered hull berths: its most populous port town, else the port its sea cargo
 * sails from, else its centre town.
 */
function merchantHullHomePort(market: Market, fallbackPortBurgId?: number): number | undefined {
  const ports = (getWorldContext().pack.burgs ?? []).filter(
    burg => burg.i && !burg.removed && burg.market === market.i && burg.port
  );
  const port = ports.sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || (a.i ?? 0) - (b.i ?? 0))[0];
  return port?.i ?? fallbackPortBurgId ?? (market.centerBurgId || undefined);
}

function getBlueprint(id: TransportAssetOrder["blueprintId"]): TransportAssetBlueprint {
  const blueprint = BLUEPRINTS.find(candidate => candidate.id === id);
  if (!blueprint) throw new Error(`[economy] Unknown transport asset blueprint: ${id}`);
  return blueprint;
}

function requiredMaterials(
  blueprint: TransportAssetBlueprint,
  quantity: number,
  market?: { goods: Record<number, { stock: number } | undefined> },
  materialNames: Readonly<Record<string, number>> = blueprint.materialNames
): Record<number, number> | null {
  const goods = getGoods();
  const materials: Record<number, number> = {};
  for (const [name, perAsset] of Object.entries(materialNames)) {
    const good = goods.find(candidate => candidate.name === name);
    if (!good) return null;
    materials[good.i] = perAsset * quantity;
  }
  if (blueprint.draftAnimalHeads) {
    const horses = goods.find(candidate => candidate.name === DRAFT_ANIMAL_GOOD_NAME);
    if (!horses) return null;
    materials[horses.i] = (materials[horses.i] ?? 0) + blueprint.draftAnimalHeads * quantity;
  }
  for (const [name, perAsset] of Object.entries(blueprint.optionalMaterialNames ?? {})) {
    const good = goods.find(candidate => candidate.name === name);
    if (good && market && (market.goods[good.i]?.stock ?? 0) + 0.0001 >= perAsset * quantity)
      materials[good.i] = perAsset * quantity;
  }
  return materials;
}

/**
 * A wright's monthly wage: the craft wage the generic workshops pay (`getSubsistenceWage`, per
 * labour point of 1,000 person-months), for one person-month.
 */
function wagePerWorkPoint(market: Market): number {
  return getSubsistenceWage(market) / DEFAULT_PEOPLE_PER_POPULATION_POINT;
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
  /** Usual materials this cycle's orders went without, by market and Good (§10.12). */
  private materialShortfallByMarket = new Map<number, Map<number, number>>();

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
    this.refundWages(order);
    order.reservedMaterials = {};
    order.status = "cancelled";
    order.blockedReason = undefined;
    setTransportAssetOrders(getTransportAssetOrders());
    return true;
  }

  /** Called once at the start of each production cycle, before recipe workers are chosen. */
  beginProductionCycle(): void {
    this.plannedWorkByBurg.clear();
    this.materialShortfallByMarket.clear();
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

  /**
   * The fitted harness a cartwright went without is ordered from the smiths and harness-makers:
   * production reads it as a market's demand, as it reads the armouries' orders (§10.12). Stock
   * already in the market is not made again, so the burgs of one market do not each make the
   * whole shortfall.
   */
  getMaterialDemandByGood(marketId: number): ReadonlyMap<number, number> {
    const demand = new Map<number, number>();
    const shortfall = this.materialShortfallByMarket.get(marketId);
    const market = shortfall && getMarketById(marketId);
    if (!shortfall || !market) return demand;
    for (const [goodId, units] of shortfall) {
      const missing = units - Math.max(0, market.goods[goodId]?.stock ?? 0);
      if (missing > 0.001) demand.set(goodId, missing);
    }
    return demand;
  }

  /**
   * A carrier who delivered to a market short of carts sold his cart and team there and went home
   * on foot or by another's wagon, when his own house had them to spare (§10.13). On arrival, own
   * vehicles the dispatching market does not need are sold to the destination market for the
   * automatic orders it has not yet funded, at what their usual materials cost there; the orders
   * are reduced by as many.
   */
  sellArrivedVehicles(
    caravan: Pick<Caravan, "transportDispatcherMarketId" | "transportAllocations" | "buyer" | "buyerType">
  ): void {
    const sellerId = caravan.transportDispatcherMarketId;
    const buyerId =
      caravan.buyerType === "market" ? caravan.buyer : getWorldContext().pack.burgs[caravan.buyer]?.market;
    if (sellerId === undefined || typeof buyerId !== "number" || buyerId === sellerId) return;
    const seller = getMarketById(sellerId);
    const buyer = getMarketById(buyerId);
    const sellerLedger = MerchantTransportAssets.ensureLedger(sellerId);
    if (!seller || !buyer || !sellerLedger) return;
    let keep: ReturnType<typeof computeLandFleetNeedCounts> | undefined;

    for (const allocation of caravan.transportAllocations ?? []) {
      if (allocation.mode !== "land") continue;
      const own = allocation.unitCount - (allocation.hiredUnits ?? 0);
      const blueprint = BLUEPRINTS.find(candidate => candidate.id === allocation.transportId);
      const balance = sellerLedger.landAssets.find(asset => asset.assetId === allocation.transportId);
      if (!(own > 0) || !blueprint || blueprint.outputMode !== "land" || !balance) continue;
      // The seller's house keeps what its own trade needs: nothing goes while it hires or builds.
      if ((balance.hired ?? 0) > 0 || this.openSimulationOrders(sellerId, blueprint.id).length) continue;
      const wanting = this.openSimulationOrders(buyerId, blueprint.id).filter(
        order => order.status === "queued" || order.status === "waitingMaterials"
      );
      const wanted = wanting.reduce((sum, order) => sum + order.quantity, 0);
      if (!(wanted > 0)) continue;
      keep ??= computeLandFleetNeedCounts(sellerId);
      const kept = blueprint.id === "pack-train" ? keep.packTrain : blueprint.id === "cart" ? keep.cart : keep.wagon;
      const total = balance.available + balance.reserved + balance.inTransit + balance.maintenance;
      const spare = Math.min(own, balance.available, total - kept);
      const perUnit = requiredMaterials(blueprint, 1);
      if (!perUnit || !(spare > 0)) continue;
      const price =
        blueprint.requiredWorkPoints * wagePerWorkPoint(buyer) +
        Object.entries(perUnit).reduce((sum, [goodId, units]) => sum + (buyer.goods[+goodId]?.price ?? 0) * units, 0);
      const treasury = getMarketTreasury(buyer);
      const money = Math.max(0, treasury.balance) + Math.max(0, getUncommittedTradeCapital(treasury));
      const affordable = price > 0 ? Math.floor((money + 0.0001) / price) : wanted;
      const sold = MerchantTransportAssets.transferLandAssets(
        sellerId,
        buyerId,
        blueprint.outputAssetId as MerchantLandAssetBalance["assetId"],
        Math.min(spare, wanted, affordable)
      );
      if (!(sold > 0)) continue;

      const paid = rn(price * sold, 2);
      const fromPurse = Math.min(Math.max(0, treasury.balance), paid);
      treasury.balance = rn(treasury.balance - fromPurse, 2);
      if (paid - fromPurse > 0)
        treasury.tradeWorkingCapital = rn(Math.max(0, (treasury.tradeWorkingCapital ?? 0) - (paid - fromPurse)), 2);
      const sellerTreasury = getMarketTreasury(seller);
      sellerTreasury.balance = rn(sellerTreasury.balance + paid, 2);

      let remaining = sold;
      for (const order of wanting.toSorted((left, right) => right.id - left.id)) {
        if (remaining <= 0) break;
        const taken = Math.min(remaining, order.quantity);
        order.quantity -= taken;
        remaining -= taken;
        if (order.quantity <= 0) {
          order.status = "cancelled";
          order.blockedReason = undefined;
        }
      }
      setTransportAssetOrders(getTransportAssetOrders());
    }
  }

  clear(): void {
    this.plannedWorkByBurg.clear();
    this.materialShortfallByMarket.clear();
    setTransportAssetOrders([]);
    setNextTransportAssetOrderId(0);
  }

  private queueSimulationReplenishment(): void {
    for (const market of getMarkets()) {
      const ledger = MerchantTransportAssets.ensureLedger(market.i);
      if (!ledger) continue;
      MerchantTransportAssets.refreshLocalCarriers(market.i);
      for (const balance of ledger.landAssets) this.withdrawSlackOrders(market.i, balance);
      const released = MerchantTransportAssets.releaseIdleLandAssets(
        market.i,
        assetId => this.openSimulationOrders(market.i, assetId).length > 0
      );
      this.returnDraftAnimals(market, released);
      for (const balance of ledger.landAssets) {
        // Maintenance is a concrete capacity loss. Keep one replacement order active until it is covered.
        const outstanding = this.openSimulationOrders(market.i, balance.assetId).reduce(
          (sum, order) => sum + order.quantity - order.completedQuantity,
          0
        );
        // Vehicles hired month after month are cheaper owned (port-freight-queue-and-warehouses.md §3.2).
        // Only what was hired a season running is ordered: a rush of a month or two was met with
        // hired teams, and the carts ordered for it stood idle when it passed (§10.14, §10.16).
        const hired = MerchantTransportAssets.takeHiredVehicleAverage(market.i, balance.assetId, PRODUCTION_CYCLE_DAYS);
        const recent = [...(balance.recentHiredAverages ?? []), hired].slice(-SUSTAINED_HIRE_CYCLES);
        const sustained = recent.length < SUSTAINED_HIRE_CYCLES ? 0 : Math.min(...recent);
        balance.recentHiredAverages = hired > 0 ? recent : undefined;
        const missing = Math.max(0, Math.ceil(balance.maintenance + sustained - 0.000001) - outstanding);
        if (missing > 0) this.createOrder({ marketId: market.i, blueprintId: balance.assetId, quantity: missing });
      }
      // Sea trade that waited for a hull asks the shipyards for one (long-distance-merchant-reach-capital.md §17).
      // A market without a port has its hull based where its sea cargo sails from, not at an
      // inland town (port-freight-queue-and-warehouses.md §10.7). The hull is then that port's
      // market's, and the inland market charters it there.
      const shortfallPort = MerchantTransportAssets.peekSeaShortfallPort(market.i);
      if (MerchantTransportAssets.takeSeaHullShortfall(market.i) > 0) {
        const homeBurgId = merchantHullHomePort(market, shortfallPort);
        if (homeBurgId !== undefined)
          simEvents.dispatchEvent(
            new CustomEvent("fmg:economy-merchant-hull-order", { detail: { marketId: market.i, homeBurgId } })
          );
      }
      // River barges are built to demand: for river cargo that found none, and a cycle's usual
      // departures ahead while craft are one-way (docs/plan/river-vessels-and-downstream-trade.md §10).
      const bargeTarget = MerchantTransportAssets.takeRiverBargeTarget(market.i);
      if (bargeTarget > 0) {
        const building = getTransportAssetOrders()
          .filter(
            order =>
              order.marketId === market.i &&
              order.blueprintId === "river-barge" &&
              order.requestedBy === "simulation" &&
              order.status !== "completed" &&
              order.status !== "cancelled"
          )
          .reduce((sum, order) => sum + order.quantity - order.completedQuantity, 0);
        const missing = bargeTarget - building;
        if (missing > 0) this.createOrder({ marketId: market.i, blueprintId: "river-barge", quantity: missing });
      }
    }
  }

  /**
   * Reserves materials and money for an order. A wheelwright built what the timber and leather in
   * hand allowed rather than waiting for the whole order: a simulation order the market can fund
   * only in part is split, the rest waiting for the next cycle (§10.11). The usual materials are
   * used for as many crafts as they fund, a plainer build for the rest (§10.12).
   */
  private fundOrder(order: TransportAssetOrder): void {
    if (order.status !== "queued" && order.status !== "waitingMaterials") return;
    const market = getMarketById(order.marketId);
    const blueprint = getBlueprint(order.blueprintId);
    const block = (reason: NonNullable<TransportAssetOrder["blockedReason"]>) => {
      order.status = "waitingMaterials";
      order.blockedReason = reason;
    };
    if (!market) {
      block("missingMaterials");
      return;
    }
    const treasury = getMarketTreasury(market);
    // A player's order is built as specified, whole or not at all.
    const player = order.requestedBy === "player";
    // The house that ships pays the cartwright or boatbuilder when the market's purse is short,
    // as a merchant bought the boat his cargo went down in (§10.11).
    const houseCapital = player ? 0 : Math.max(0, getUncommittedTradeCapital(treasury));
    const money = Math.max(0, treasury.balance) + houseCapital;
    const options = [blueprint.materialNames, ...(player ? [] : (blueprint.substituteMaterialNames ?? []))];
    // The wrights are paid as they work, from a wage fund set aside with the materials.
    const wageRate = wagePerWorkPoint(market);
    const wagesPerUnit = blueprint.requiredWorkPoints * wageRate;
    let best: {
      quantity: number;
      materials: Record<number, number>;
      reason?: "budgetLimit" | "insufficientTreasury";
      optionIndex: number;
    } | null = null;
    for (const [optionIndex, names] of options.entries()) {
      if (best && best.quantity > 0) break;
      const perUnit = requiredMaterials(blueprint, 1, market, names);
      if (!perUnit) continue;
      const costPerUnit =
        wagesPerUnit +
        Object.entries(perUnit).reduce((sum, [goodId, units]) => sum + (market.goods[+goodId]?.price ?? 0) * units, 0);
      let quantity = order.quantity;
      for (const [goodId, units] of Object.entries(perUnit))
        quantity = Math.min(quantity, Math.floor(((market.goods[+goodId]?.stock ?? 0) + 0.0001) / units));
      let reason: "budgetLimit" | "insufficientTreasury" | undefined;
      if (costPerUnit > 0) {
        const byBudget =
          order.budgetLimit === undefined ? quantity : Math.floor((order.budgetLimit + 0.0001) / costPerUnit);
        const byTreasury = Math.floor((money + 0.0001) / costPerUnit);
        if (byBudget < quantity) reason = "budgetLimit";
        if (byTreasury < Math.min(quantity, byBudget)) reason = "insufficientTreasury";
        quantity = Math.min(quantity, byBudget, byTreasury);
      }
      if (player && quantity < order.quantity) quantity = 0;
      if (!best || quantity > best.quantity) {
        const materials = quantity > 0 ? requiredMaterials(blueprint, quantity, market, names) : null;
        best = { quantity: materials ? quantity : 0, materials: materials ?? {}, reason, optionIndex };
      }
    }
    if (!best || best.quantity <= 0) {
      this.recordMaterialShortfall(order, blueprint, {});
      block(best?.reason ?? "missingMaterials");
      return;
    }
    let remainder: TransportAssetOrder | null = null;
    if (best.quantity < order.quantity) {
      remainder = this.createOrder({
        marketId: order.marketId,
        blueprintId: order.blueprintId,
        quantity: order.quantity - best.quantity
      });
      order.quantity = best.quantity;
    }
    const costs = Object.entries(best.materials).map(([goodId, units]) => {
      const row = market.goods[+goodId];
      return { row, units, cost: (row?.price ?? 0) * units };
    });
    const wages = rn(wagesPerUnit * order.quantity, 2);
    const totalCost = costs.reduce((sum, item) => sum + item.cost, 0) + wages;
    for (const item of costs) if (item.row) item.row.stock = rn(Math.max(0, item.row.stock - item.units), 4);
    const fromPurse = Math.min(Math.max(0, treasury.balance), totalCost);
    treasury.balance = rn(treasury.balance - fromPurse, 2);
    if (totalCost - fromPurse > 0)
      treasury.tradeWorkingCapital = rn(Math.max(0, (treasury.tradeWorkingCapital ?? 0) - (totalCost - fromPurse)), 2);
    order.reservedMaterials = best.materials;
    order.reservedWages = wages;
    order.wagePerWorkPoint = wageRate;
    order.fundedAmount = rn(totalCost, 2);
    order.status = "building";
    order.blockedReason = undefined;
    this.recordMaterialShortfall(order, blueprint, best.materials);
    // The usual materials ran out first: the rest is built plainer in the same cycle.
    if (remainder && best.optionIndex < options.length - 1) this.fundOrder(remainder);
  }

  private recordMaterialShortfall(
    order: TransportAssetOrder,
    blueprint: TransportAssetBlueprint,
    funded: Readonly<Record<number, number>>
  ): void {
    const usual = requiredMaterials(blueprint, order.quantity);
    if (!usual) return;
    for (const [goodId, units] of Object.entries(usual)) {
      const missing = units - (funded[+goodId] ?? 0);
      if (!(missing > 0.0001)) continue;
      const shortfall = this.materialShortfallByMarket.get(order.marketId) ?? new Map<number, number>();
      shortfall.set(+goodId, (shortfall.get(+goodId) ?? 0) + missing);
      this.materialShortfallByMarket.set(order.marketId, shortfall);
    }
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
    const ruralCapacityByMarket = new Map<number, number>();
    const ruralCapacity = (marketId: number): number => {
      let capacity = ruralCapacityByMarket.get(marketId);
      if (capacity === undefined) {
        const world = getWorldContext();
        capacity =
          applyCalibration && world.pack.cells?.i
            ? (getMarketRuralPopulation(world, marketId) / 1000) * RURAL_TRANSPORT_CRAFT_PEOPLE_PER_THOUSAND
            : 0;
        ruralCapacityByMarket.set(marketId, capacity);
      }
      return capacity;
    };
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
      // What the town's wrights cannot take goes to the villages. They are no burg's workforce, so
      // their work is credited now rather than drawn from a burg's labour in production.
      if (unassigned > 0) {
        const key = `rural:${order.marketId}`;
        const workPoints = Math.min(unassigned, Math.max(0, ruralCapacity(order.marketId) - (assigned.get(key) ?? 0)));
        if (workPoints > 0) {
          assigned.set(key, (assigned.get(key) ?? 0) + workPoints);
          unassigned -= workPoints;
          this.applyWork(order.id, workPoints, blueprint.requiredCraft, null);
        }
      }
      if (unassigned > 0) order.blockedReason = "missingCraftWorkers";
    }
  }

  /**
   * A market whose own vehicles of a kind stood free every day of the cycle, without hiring any,
   * withdraws its automatic orders of that kind the wright has not yet been paid for, up to the
   * number that stood free: the rush they were ordered for has passed (§10.14).
   */
  private withdrawSlackOrders(marketId: number, balance: MerchantLandAssetBalance): void {
    const idle = Math.min(balance.idleLowWater ?? 0, balance.available);
    if (!(idle >= 1) || (balance.hiredDays ?? 0) > 0 || (balance.hired ?? 0) > 0) return;
    let remaining = Math.floor(idle);
    const unfunded = this.openSimulationOrders(marketId, balance.assetId)
      .filter(order => order.status === "queued" || order.status === "waitingMaterials")
      .toSorted((left, right) => right.id - left.id);
    for (const order of unfunded) {
      if (remaining <= 0) break;
      const taken = Math.min(remaining, order.quantity);
      order.quantity -= taken;
      remaining -= taken;
      if (order.quantity <= 0) {
        order.status = "cancelled";
        order.blockedReason = undefined;
      }
    }
    if (remaining < Math.floor(idle)) setTransportAssetOrders(getTransportAssetOrders());
  }

  private openSimulationOrders(marketId: number, blueprintId: TransportAssetOrder["blueprintId"]) {
    return getTransportAssetOrders().filter(
      order =>
        order.marketId === marketId &&
        order.blueprintId === blueprintId &&
        order.requestedBy === "simulation" &&
        order.status !== "completed" &&
        order.status !== "cancelled"
    );
  }

  private getOrdersByPriority(): TransportAssetOrder[] {
    return [...getTransportAssetOrders()].toSorted((left, right) => {
      const priority = Number(right.requestedBy === "player") - Number(left.requestedBy === "player");
      return priority || left.id - right.id;
    });
  }

  /** A convoy let go leaves the horses the market paid for in its stock; carts and gear go with it (§10.17). */
  private returnDraftAnimals(
    market: Market,
    released: Partial<Record<MerchantLandAssetBalance["assetId"], { count: number; draftAnimalHeads: number }>>
  ): void {
    const horses = getGoods().find(good => good.name === DRAFT_ANIMAL_GOOD_NAME);
    const heads = Object.values(released).reduce((sum, entry) => sum + (entry?.draftAnimalHeads ?? 0), 0);
    if (!horses || !(heads > 0)) return;
    const row = market.goods[horses.i] ?? { stock: 0, price: horses.value };
    row.stock = rn(row.stock + heads, 4);
    market.goods[horses.i] = row;
  }

  private refundWages(order: TransportAssetOrder): void {
    const left = order.reservedWages ?? 0;
    order.reservedWages = undefined;
    const market = getMarketById(order.marketId);
    if (!(left > 0) || !market) return;
    const treasury = getMarketTreasury(market);
    treasury.balance = rn(treasury.balance + left, 2);
  }

  /** `burgId` null is village work, outside any guild. */
  private applyWork(orderId: number, workPoints: number, domain: CraftKnowledgeDomain, burgId: number | null): void {
    const order = getTransportAssetOrders().find(candidate => candidate.id === orderId);
    if (order?.status !== "building") return;
    const bonus = burgId === null ? 1 : getGuildBonus(burgId, domain);
    order.workPoints = rn(order.workPoints + workPoints * bonus, 4);
    order.blockedReason = undefined;
    // Town wrights' wages go to their burg's households, village wrights' to the countryside's.
    const wage = rn(Math.min(order.reservedWages ?? 0, workPoints * (order.wagePerWorkPoint ?? 0)), 2);
    if (wage > 0) {
      order.reservedWages = rn((order.reservedWages ?? 0) - wage, 2);
      if (burgId === null) creditRuralHouseholdWealth(getMarketById(order.marketId), wage);
      else creditHouseholdWealth(burgId, wage);
    }
    const blueprint = getBlueprint(order.blueprintId);
    const completed = Math.min(order.quantity, Math.floor(order.workPoints / blueprint.requiredWorkPoints));
    const newlyCompleted = completed - order.completedQuantity;
    if (newlyCompleted > 0) {
      if (blueprint.outputMode === "land") {
        MerchantTransportAssets.addAvailableLandAssets(
          order.marketId,
          blueprint.outputAssetId as MerchantLandAssetBalance["assetId"],
          newlyCompleted,
          (blueprint.draftAnimalHeads ?? 0) * newlyCompleted
        );
      } else {
        MerchantTransportAssets.addAvailableRiverAssets(order.marketId, newlyCompleted);
      }
      // Materials were reserved for the whole order; release each completed craft's share.
      const remainingQuantity = order.quantity - order.completedQuantity;
      for (const [goodId, reserved] of Object.entries(order.reservedMaterials)) {
        order.reservedMaterials[+goodId] = rn(
          Math.max(0, reserved - (reserved * newlyCompleted) / Math.max(1, remainingQuantity)),
          4
        );
      }
      order.completedQuantity = completed;
    }
    if (order.completedQuantity === order.quantity) {
      // A guild's skill finishes the work in fewer days; the wages not earned go back.
      this.refundWages(order);
      order.status = "completed";
      order.reservedMaterials = {};
      order.blockedReason = undefined;
    }
    setTransportAssetOrders(getTransportAssetOrders());
  }
}

export const TransportAssetOrders = new TransportAssetOrdersModule();
