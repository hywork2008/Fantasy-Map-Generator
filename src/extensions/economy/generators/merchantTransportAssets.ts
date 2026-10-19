import { isTechnologyAtLeast } from "../../../generators/technologyProgress";
import { simEvents } from "../../../simulation/events";
import { SHIP_CLASS_DEFINITIONS, type ShipbuildingMerchantHullSnapshot } from "../../hostTypes";
import {
  getExportStagingLots,
  getFlowCycleHistory,
  getGoods,
  getMarketById,
  getMerchantOrganizations,
  getMerchantTransportLedgers,
  getNextTransportReservationId,
  getTransportReservations,
  getWorldContext,
  setMerchantTransportLedgers,
  setNextTransportReservationId,
  setTransportReservations
} from "../economyContext";
import { CaravanMovement, getDraftAnimalType } from "./caravanMovement";
import { DEMAND_PRIORITY, DEMAND_TARGET_FACTORS, type DemandCategory, Goods, isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Good } from "./goodsGeneratorTypes";
import {
  estimateSoftAnnualExportCargoSlots,
  getDefaultMonthsOfCover,
  type LandFleetSeedCounts,
  landFleetCountsFromBurgScale,
  mergeLandFleetCounts,
  sizeLandFleetFromAnnualExportSlots
} from "./marketFlowBudget";
import { buildFlowReportSummary } from "./marketFlowReport";
import type {
  Caravan,
  MerchantLandAssetBalance,
  MerchantRiverAssetBalance,
  MerchantTransportLedger,
  MerchantWaterAssetReference,
  TradeRouteSegment,
  TransportAllocation,
  TransportReservation
} from "./marketTypes";
import { getGoodCargoSlotsPerUnit, getLandTransportDefinition, RIVER_BARGE_TRANSPORT } from "./tradeCargo";

const MAINTENANCE_RECOVERY_DAYS = 30;
/**
 * Days a free hull lies in port before it sails empty to cargo elsewhere. A master looked for a
 * freight where he lay, so a ship carried cargo round a triangle rather than in ballast (§4.5).
 */
const BALLAST_MIN_IDLE_DAYS = 60;
/** Coastal track over the straight line between two ports. */
const BALLAST_DETOUR = 1.4;
/** A light ship waits on wind and on her owner's orders; ballast passages run slower than freight. */
const BALLAST_SLOWNESS = 1.5;
/**
 * Carts and wagons a market may hire from local carriers on top of its own, as a share of its own
 * fleet. Merchants rarely owned their carts: carriers were hired, and peasants' teams pressed in
 * when trade ran high, so a short fleet raised freight rather than stopping trade
 * (docs/plan/port-freight-queue-and-warehouses.md §2.1, §3).
 */
export const LAND_HIRE_SHARE = 1;
/** Freight on hired vehicles relative to the market's own. Thin bulk trade stops on price. */
export const LAND_HIRE_FREIGHT_MULTIPLIER = 1.5;
/** Top-up fleets from measured A0 flow only after this many production cycles. */
const FLOW_FLEET_TOPUP_MIN_CYCLES = 3;
export const RIVER_BARGE_CARGO_CAPACITY_SLOTS = RIVER_BARGE_TRANSPORT.cargoCapacitySlots;
/** Wood one river barge is built from (its TransportAssetOrder blueprint). */
export const RIVER_BARGE_WOOD_UNITS = 5;
/**
 * Share of that wood recovered when a one-way craft is broken up downstream. A Mississippi
 * flatboat broken up at New Orleans fetched about a quarter of what it cost to build, labour,
 * pitch and rope included; the planks were most of what was left (docs/plan/river-vessels-and-
 * downstream-trade.md §10).
 */
export const RIVER_BARGE_SALVAGE_WOOD_SHARE = 0.5;
/** Weight of the latest cycle in the smoothed barge departures. */
const RIVER_DEPARTURE_SMOOTHING = 0.2;
/** A market keeps barges built ahead only once it sends at least this many a cycle. */
const RIVER_PREBUILD_MIN_DEPARTURES_PER_CYCLE = 1;

/**
 * Until steam can tow a craft back, a river barge is built for one trip downstream and broken
 * up where it lands: the Ulm boats on the Danube were sold as timber and firewood at Vienna, Rhine
 * and Black Forest rafts were the timber they carried, and flatboats were dismantled at New
 * Orleans. Steam towing made craft worth bringing back, so from coastal steam navigation (adopted)
 * an arriving barge joins the destination market's fleet instead.
 */
export function isOneWayRiverCraftEra(marketId: number): boolean {
  const market = getMarketById(marketId);
  const stateId = market ? (getWorldContext().pack.burgs[market.centerBurgId]?.state ?? 0) : 0;
  return !(stateId > 0 && isTechnologyAtLeast("coastalSteamNavigation", stateId, "adopted"));
}

/** Breaks up arrived one-way barges at `marketId`: their recoverable wood goes to its stock. */
function salvageRiverBarges(marketId: number | undefined, barges: number): void {
  if (!(barges > 0) || typeof marketId !== "number") return;
  const market = getMarketById(marketId);
  const wood = getGoods().find(good => good.name === "Wood");
  if (!market || !wood) return;
  const units = barges * RIVER_BARGE_WOOD_UNITS * RIVER_BARGE_SALVAGE_WOOD_SHARE;
  const row = market.goods[wood.i];
  if (row) row.stock += units;
  else market.goods[wood.i] = { stock: units, price: wood.value };
  recordGoodFlow({ direction: "source", category: "vesselSalvage", goodId: wood.i, units, marketId });
}

export type MerchantTransportAssetAvailability = {
  assetId: string;
  assetName: string;
  cargoCapacitySlots: number;
  available: number;
  reserved: number;
  inTransit: number;
  maintenance: number;
  total: number;
};

export type TransportReservationResult = {
  reservation: TransportReservation;
  dispatcherMarketId: number;
};

function isTradeableGood(good: Good): boolean {
  if (!isGoodEnabled(good)) return false;
  if (good.tags.includes("stapleFood")) return false;
  return Boolean(good.distribution || good.recipes?.length);
}

function collectConsumerDemandFactors(goods: readonly Good[]): number[] {
  const totalCoverageByCategory = Object.fromEntries(
    DEMAND_PRIORITY.map(category => [
      category,
      goods.reduce((sum, good) => sum + (good.demandCoverage?.[category] || 0), 0) || 1
    ])
  ) as Record<DemandCategory, number>;

  const demandFactor: number[] = [];
  for (const good of goods) {
    demandFactor[good.i] = DEMAND_PRIORITY.reduce((sum, category) => {
      const share = (good.demandCoverage?.[category] || 0) / (totalCoverageByCategory[category] || 1);
      return sum + share * DEMAND_TARGET_FACTORS[category];
    }, 0);
  }
  return demandFactor;
}

function collectIndustrialDemandFactors(goods: readonly Good[], consumerDemandFactors: number[]): number[] {
  const demandFactor: number[] = [];
  for (const good of goods) {
    if (!good.recipes?.length) continue;
    const outputDemand = consumerDemandFactors[good.i] || 0;
    for (const recipe of good.recipes) {
      for (const [ingredientIdStr, amount] of Object.entries(recipe)) {
        const ingredientId = Number(ingredientIdStr);
        const ingredient = Goods.get(ingredientId);
        if (!ingredient || !isGoodEnabled(ingredient)) continue;
        demandFactor[ingredientId] = (demandFactor[ingredientId] || 0) + amount * outputDemand;
      }
    }
  }
  return demandFactor;
}

function marketPopulation(marketId: number): number {
  let population = 0;
  for (const burg of getWorldContext().pack.burgs ?? []) {
    if (!burg.i || burg.removed || burg.market !== marketId || !burg.population) continue;
    population += burg.population;
  }
  return population;
}

function stagingUnitsByGood(marketId: number): Map<number, number> {
  const byGood = new Map<number, number>();
  for (const lot of getExportStagingLots()) {
    if (lot.marketId !== marketId || lot.units <= 0) continue;
    byGood.set(lot.goodId, (byGood.get(lot.goodId) || 0) + lot.units);
  }
  return byGood;
}

/**
 * Prefer multi-cycle A0 measured export slots when available; otherwise soft budget from
 * retail stock + export staging (so booked-but-not-yet-sailed cargo still sizes the fleet).
 */
export function estimateMarketAnnualExportCargoSlots(marketId: number): number {
  const history = getFlowCycleHistory();
  if (history.length >= FLOW_FLEET_TOPUP_MIN_CYCLES) {
    const summary = buildFlowReportSummary(history);
    const measured = summary.rows
      .filter(row => row.marketId === marketId)
      .reduce((sum, row) => sum + row.exportSlots, 0);
    if (measured > 0) return measured;
  }

  const market = getMarketById(marketId);
  if (!market) return 0;

  const goods = getGoods().filter(isTradeableGood);
  if (!goods.length) return 0;

  const consumer = collectConsumerDemandFactors(goods);
  const industrial = collectIndustrialDemandFactors(goods, consumer);
  const population = marketPopulation(marketId);
  const staging = stagingUnitsByGood(marketId);

  const rows = goods.map(good => {
    const retail = market.goods[good.i]?.stock ?? 0;
    const staged = staging.get(good.i) || 0;
    return {
      stock: retail + staged,
      cycleDemand: population * ((consumer[good.i] || 0) + (industrial[good.i] || 0)),
      cargoSlotsPerUnit: getGoodCargoSlotsPerUnit(good),
      monthsOfCover: getDefaultMonthsOfCover(good)
    };
  });

  return estimateSoftAnnualExportCargoSlots(rows);
}

/** Land fleet counts: max(burg floor, export-slot seed). */
export function computeLandFleetSeedCounts(marketId: number): LandFleetSeedCounts {
  const burgs = getWorldContext().pack.burgs ?? [];
  const burgCount = burgs.filter(burg => !burg.removed && burg.market === marketId).length;
  const burgFloor = landFleetCountsFromBurgScale(burgCount);
  const annualSlots = estimateMarketAnnualExportCargoSlots(marketId);
  const fromExport = sizeLandFleetFromAnnualExportSlots({ annualExportCargoSlots: annualSlots });
  return mergeLandFleetCounts(burgFloor, fromExport);
}

function makeLandBalance(assetId: MerchantLandAssetBalance["assetId"], count: number): MerchantLandAssetBalance {
  return {
    assetId,
    available: Math.max(0, count),
    reserved: 0,
    inTransit: 0,
    maintenance: 0,
    recoveryDays: 0
  };
}

function createLandAssets(marketId: number): MerchantLandAssetBalance[] {
  const counts = computeLandFleetSeedCounts(marketId);
  return [
    makeLandBalance("pack-train", counts.packTrain),
    makeLandBalance("cart", counts.cart),
    makeLandBalance("wagon", counts.wagon)
  ];
}

function landAssetTotal(balance: MerchantLandAssetBalance): number {
  return balance.available + balance.reserved + balance.inTransit + balance.maintenance;
}

/**
 * Grow land fleets toward export-slot needs without shrinking or touching reserved/in-transit units.
 * Called after flow diagnostics accumulate so early soft-budget seeds can catch up.
 */
function topUpLandAssets(ledger: MerchantTransportLedger): void {
  const desired = computeLandFleetSeedCounts(ledger.marketId);
  const targets: { assetId: MerchantLandAssetBalance["assetId"]; count: number }[] = [
    { assetId: "pack-train", count: desired.packTrain },
    { assetId: "cart", count: desired.cart },
    { assetId: "wagon", count: desired.wagon }
  ];

  for (const target of targets) {
    let balance = ledger.landAssets.find(asset => asset.assetId === target.assetId);
    if (!balance) {
      balance = makeLandBalance(target.assetId, 0);
      ledger.landAssets.push(balance);
    }
    const total = landAssetTotal(balance);
    if (target.count > total) {
      balance.available += target.count - total;
      assertBalance(balance);
    }
  }
}

/** Hired vehicles one kind may add: the market's own count of that kind times the hire share. */
function hireCap(balance: MerchantLandAssetBalance): number {
  return Math.floor(landAssetTotal(balance) * LAND_HIRE_SHARE);
}

function ownUnits(allocation: TransportAllocation): number {
  return Math.max(0, allocation.unitCount - (allocation.hiredUnits ?? 0));
}

function releaseHired(balance: MerchantLandAssetBalance, allocation: TransportAllocation): void {
  const hired = allocation.hiredUnits ?? 0;
  if (!(hired > 0)) return;
  const left = Math.max(0, (balance.hired ?? 0) - hired);
  balance.hired = left > 0 ? left : undefined;
}

/** A hull may be another market's, chartered for this trip (§4.2), so look in every ledger. */
function findWaterAsset(hullId: number): MerchantWaterAssetReference | undefined {
  for (const ledger of getMerchantTransportLedgers()) {
    const asset = ledger.waterAssets?.find(item => item.shipHullId === hullId);
    if (asset) return asset;
  }
  return undefined;
}

/** The market a port belongs to, or null for a hull at sea. */
function berthMarketId(asset: MerchantWaterAssetReference): number | null {
  if (asset.berthBurgId === undefined) return null;
  const marketId = getWorldContext().pack.burgs?.[asset.berthBurgId]?.market;
  return typeof marketId === "number" ? marketId : null;
}

function getOrganizationId(marketId: number): number | undefined {
  return getMerchantOrganizations().find(organization => organization.homeMarketId === marketId)?.i;
}

function findLedger(marketId: number): MerchantTransportLedger | undefined {
  return getMerchantTransportLedgers().find(ledger => ledger.marketId === marketId);
}

function getShipDefinition(shipClassId: string) {
  return SHIP_CLASS_DEFINITIONS.find(shipClass => shipClass.id === shipClassId);
}

function getWaterAssetAvailability(asset: MerchantWaterAssetReference): MerchantTransportAssetAvailability {
  const definition = getShipDefinition(asset.shipClassId);
  return {
    assetId: `hull-${asset.shipHullId}`,
    assetName: `${definition?.name ?? asset.shipClassId} #${asset.shipHullId}`,
    cargoCapacitySlots: definition?.cargoCapacitySlots ?? 0,
    available: asset.state === "available" ? 1 : 0,
    reserved: asset.state === "reserved" ? 1 : 0,
    inTransit: asset.state === "inTransit" ? 1 : 0,
    maintenance: asset.state === "maintenance" ? 1 : 0,
    total: 1
  };
}

function assertBalance(balance: MerchantLandAssetBalance | MerchantRiverAssetBalance): void {
  if ([balance.available, balance.reserved, balance.inTransit, balance.maintenance].some(value => value < 0)) {
    throw new Error(`[economy] Invalid merchant transport balance for ${balance.assetId}`);
  }
}

function hasLandAllocation(allocations: readonly TransportAllocation[]): boolean {
  return allocations.some(allocation => allocation.mode === "land" && allocation.unitCount > 0);
}

function hasWaterAllocation(allocations: readonly TransportAllocation[]): boolean {
  return allocations.some(allocation => allocation.mode === "water" && allocation.usedSlots > 0);
}

function hasRiverAllocation(allocations: readonly TransportAllocation[]): boolean {
  return allocations.some(allocation => allocation.mode === "river" && allocation.unitCount > 0);
}

function takeWaterConvoy<T extends { definition: { cargoCapacitySlots: number } }>(
  available: readonly T[],
  neededSlots: number
): T[] {
  const selected: T[] = [];
  let capacity = 0;
  for (const entry of [...available].sort(
    (left, right) => right.definition.cargoCapacitySlots - left.definition.cargoCapacitySlots
  )) {
    selected.push(entry);
    capacity += entry.definition.cargoCapacitySlots;
    if (capacity >= neededSlots) return selected;
  }
  return [];
}

/**
 * Owns all mutation rules for durable market transport assets. Caravans only receive a
 * reservation id, so callers cannot accidentally duplicate an asset between shipments.
 */
export class MerchantTransportAssetsModule {
  /** True only while Shipbuilding has published a current merchant-hull snapshot. */
  private waterAssetModeActive = false;

  ensureLedger(marketId: number): MerchantTransportLedger | null {
    if (!getMarketById(marketId)) return null;
    const existing = findLedger(marketId);
    if (existing) {
      existing.organizationId = getOrganizationId(marketId);
      existing.waterAssets ??= [];
      existing.riverAssets ??= [];
      return existing;
    }

    const ledger: MerchantTransportLedger = {
      marketId,
      organizationId: getOrganizationId(marketId),
      landAssets: createLandAssets(marketId),
      riverAssets: [],
      waterAssets: [],
      lastReconciledTick: 0
    };
    const ledgers = getMerchantTransportLedgers();
    ledgers.push(ledger);
    setMerchantTransportLedgers(ledgers);
    return ledger;
  }

  /**
   * After A0 flow cycles accumulate, grow each market's land fleet toward measured/soft
   * annual export slots. Never reduces assets or cancels reservations.
   */
  topUpFleetsFromExportDemand(): void {
    const history = getFlowCycleHistory();
    if (history.length < FLOW_FLEET_TOPUP_MIN_CYCLES) return;

    for (const ledger of getMerchantTransportLedgers()) {
      topUpLandAssets(ledger);
    }
  }

  /** Reconciles Economy references without duplicating Shipbuilding's individual hull records. */
  reconcileMerchantHulls(hulls: readonly ShipbuildingMerchantHullSnapshot[]): void {
    this.waterAssetModeActive = true;
    const burgs = getWorldContext().pack.burgs ?? [];
    const hullIdsByMarket = new Map<number, Set<number>>();

    for (const hull of hulls) {
      const marketId = burgs[hull.homeBurgId]?.market;
      if (typeof marketId !== "number" || !getMarketById(marketId)) continue;
      const ledger = this.ensureLedger(marketId);
      if (!ledger) continue;
      const existing = ledger.waterAssets.find(asset => asset.shipHullId === hull.id);
      const state =
        existing?.reservationId !== undefined || existing?.ballast
          ? existing.state
          : hull.status === "maintenance"
            ? "maintenance"
            : hull.status === "cargo"
              ? "inTransit"
              : "available";
      const berth = hull.status === "docked" ? (hull.currentBurgId ?? hull.homeBurgId) : undefined;
      const next: MerchantWaterAssetReference = {
        shipHullId: hull.id,
        shipClassId: hull.shipClassId,
        homeBurgId: hull.homeBurgId,
        state,
        ...(existing?.reservationId === undefined ? {} : { reservationId: existing.reservationId }),
        ...(typeof berth === "number" ? { berthBurgId: berth } : {})
      };
      if (existing && typeof berth !== "number") delete existing.berthBurgId;
      if (existing) Object.assign(existing, next);
      else ledger.waterAssets.push(next);

      let ids = hullIdsByMarket.get(marketId);
      if (!ids) {
        ids = new Set();
        hullIdsByMarket.set(marketId, ids);
      }
      ids.add(hull.id);
    }

    for (const ledger of getMerchantTransportLedgers()) {
      const currentIds = hullIdsByMarket.get(ledger.marketId) ?? new Set<number>();
      ledger.waterAssets ??= [];
      ledger.waterAssets = ledger.waterAssets.filter(asset => currentIds.has(asset.shipHullId));
    }
  }

  setWaterAssetModeActive(active: boolean): void {
    this.waterAssetModeActive = active;
  }

  /** True while Shipbuilding has published a merchant-hull snapshot (finite sea fleet mode). */
  isWaterAssetModeActive(): boolean {
    return this.waterAssetModeActive;
  }

  requestMerchantHullSnapshot(): void {
    const detail = { source: "economy" as const, handled: false };
    simEvents.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hulls-request", { detail }));
    if (!detail.handled) this.waterAssetModeActive = false;
  }

  getDispatcherMarketId(caravan: Pick<Caravan, "seller" | "sellerType">): number | null {
    if (caravan.sellerType === "market") return getMarketById(caravan.seller) ? caravan.seller : null;
    const burg = getWorldContext().pack.burgs?.[caravan.seller];
    const marketId = burg?.market;
    return typeof marketId === "number" && getMarketById(marketId) ? marketId : null;
  }

  reserve(
    dispatcherMarketId: number,
    caravanId: number,
    allocations: readonly TransportAllocation[],
    itinerary?: {
      originBurgId?: number | null;
      destinationBurgId?: number | null;
    }
  ): TransportReservationResult | null {
    if (!hasLandAllocation(allocations) && !hasWaterAllocation(allocations) && !hasRiverAllocation(allocations))
      return null;
    const ledger = this.ensureLedger(dispatcherMarketId);
    if (!ledger) return null;

    const requestedLandAllocations = allocations.filter(
      (allocation): allocation is TransportAllocation & { mode: "land" } =>
        allocation.mode === "land" && allocation.unitCount > 0
    );
    // Own vehicles first; the rest are hired from local carriers up to the hire share (§3).
    const balances = requestedLandAllocations.map(allocation => {
      const balance = ledger.landAssets.find(asset => asset.assetId === allocation.transportId);
      const own = balance ? Math.min(balance.available, allocation.unitCount) : 0;
      return { allocation, balance, own, hired: allocation.unitCount - own };
    });
    if (
      balances.some(({ balance, hired }) => !balance || (hired > 0 && (balance.hired ?? 0) + hired > hireCap(balance)))
    )
      return null;
    const riverAllocations = allocations.filter(
      (allocation): allocation is TransportAllocation & { mode: "river" } =>
        allocation.mode === "river" && allocation.unitCount > 0
    );
    const riverBalance = ledger.riverAssets.find(asset => asset.assetId === "river-barge");
    if (
      riverAllocations.some(allocation => allocation.transportId !== "river-barge") ||
      (riverAllocations.length &&
        (!riverBalance || riverBalance.available < riverAllocations.reduce((sum, item) => sum + item.unitCount, 0)))
    ) {
      return null;
    }

    const waterAllocations = this.allocateWaterAssets(ledger, allocations);
    if (hasWaterAllocation(allocations) && this.waterAssetModeActive && !waterAllocations) return null;
    const hiredByAllocation = new Map<TransportAllocation, number>(
      balances.map(entry => [entry.allocation, entry.hired])
    );
    const withHire = (allocation: TransportAllocation): TransportAllocation => {
      const hired = hiredByAllocation.get(allocation) ?? 0;
      const { hiredUnits: _ignored, ...rest } = allocation;
      return hired > 0 ? { ...rest, hiredUnits: hired } : rest;
    };
    const resolvedAllocations = waterAllocations
      ? [...allocations.filter(allocation => allocation.mode !== "water").map(withHire), ...waterAllocations]
      : allocations.map(withHire);
    const hullIds = resolvedAllocations.flatMap(allocation => allocation.shipHullIds ?? []);
    if (
      hullIds.length &&
      !this.reserveShipbuildingHulls(hullIds, {
        caravanId,
        originBurgId: itinerary?.originBurgId,
        destinationBurgId: itinerary?.destinationBurgId
      })
    ) {
      return null;
    }

    for (const { balance, own, hired } of balances) {
      if (!balance) continue;
      balance.available -= own;
      balance.reserved += own;
      if (hired > 0) balance.hired = (balance.hired ?? 0) + hired;
      assertBalance(balance);
    }
    for (const allocation of riverAllocations) {
      if (!riverBalance) continue;
      riverBalance.available -= allocation.unitCount;
      riverBalance.reserved += allocation.unitCount;
      assertBalance(riverBalance);
    }

    const nextId = getNextTransportReservationId();
    const reservation: TransportReservation = {
      id: nextId,
      dispatcherMarketId,
      caravanId,
      allocations: resolvedAllocations.map(allocation => ({ ...allocation })),
      state: "reserved"
    };
    const reservations = getTransportReservations();
    reservations.push(reservation);
    for (const hullId of hullIds) {
      const asset = findWaterAsset(hullId);
      if (!asset) continue;
      asset.state = "reserved";
      asset.reservationId = reservation.id;
    }
    setTransportReservations(reservations);
    setNextTransportReservationId(nextId + 1);
    return { reservation, dispatcherMarketId };
  }

  private allocateWaterAssets(
    ledger: MerchantTransportLedger,
    allocations: readonly TransportAllocation[]
  ): TransportAllocation[] | null {
    const requested = allocations.filter(allocation => allocation.mode === "water" && allocation.usedSlots > 0);
    if (!requested.length) return [];
    if (!this.waterAssetModeActive) return null;

    type Entry = {
      asset: MerchantWaterAssetReference;
      definition: NonNullable<ReturnType<typeof getShipDefinition>>;
    };
    const entriesOf = (assets: readonly MerchantWaterAssetReference[]): Entry[] =>
      assets
        .filter(asset => asset.state === "available")
        .map(asset => ({ asset, definition: getShipDefinition(asset.shipClassId) }))
        .filter((entry): entry is Entry => Boolean(entry.definition));
    const available = entriesOf(ledger.waterAssets);
    // Hulls of other markets lying at this market's ports take freight as well (§4.2).
    const chartered = entriesOf(
      getMerchantTransportLedgers()
        .filter(other => other.marketId !== ledger.marketId)
        .flatMap(other => other.waterAssets ?? [])
        .filter(asset => berthMarketId(asset) === ledger.marketId)
    );
    const resolved: TransportAllocation[] = [];
    const pick = (pool: Entry[], neededSlots: number): Entry[] => {
      const single = pool
        .filter(entry => entry.definition.cargoCapacitySlots >= neededSlots)
        .sort((left, right) => left.definition.cargoCapacitySlots - right.definition.cargoCapacitySlots)[0];
      return single ? [single] : takeWaterConvoy(pool, neededSlots);
    };

    for (const allocation of requested) {
      const neededSlots = allocation.usedSlots;
      let selected = pick(available, neededSlots);
      if (!selected.length) selected = pick([...available, ...chartered], neededSlots);
      if (!selected.length) return null;

      let remainingSlots = neededSlots;
      for (const entry of selected) {
        const index = available.indexOf(entry);
        if (index >= 0) available.splice(index, 1);
        const charterIndex = chartered.indexOf(entry);
        if (charterIndex >= 0) chartered.splice(charterIndex, 1);
        const capacitySlots = entry.definition.cargoCapacitySlots;
        const usedSlots = Math.min(capacitySlots, remainingSlots);
        remainingSlots -= usedSlots;
        resolved.push({
          mode: "water",
          transportId: entry.definition.id,
          transportName: entry.definition.name,
          unitCount: 1,
          capacitySlots,
          usedSlots,
          shipHullIds: [entry.asset.shipHullId]
        });
      }
    }
    return resolved;
  }

  private reserveShipbuildingHulls(
    hullIds: readonly number[],
    itinerary?: {
      caravanId?: number;
      originBurgId?: number | null;
      destinationBurgId?: number | null;
    }
  ): boolean {
    const detail = {
      hullIds,
      caravanId: itinerary?.caravanId,
      originBurgId: itinerary?.originBurgId,
      destinationBurgId: itinerary?.destinationBurgId,
      result: undefined as "fulfilled" | "unavailable" | undefined
    };
    simEvents.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hull-reservation-request", { detail }));
    return detail.result === "fulfilled";
  }

  private releaseShipbuildingHulls(
    hullIds: readonly number[],
    outcome: "arrived" | "lost",
    destinationBurgId?: number | null
  ): void {
    if (!hullIds.length) return;
    const detail = {
      hullIds,
      outcome,
      destinationBurgId,
      result: undefined as "fulfilled" | "unavailable" | undefined
    };
    simEvents.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hull-release-request", { detail }));
  }

  depart(reservationId: number): void {
    const reservation = getTransportReservations().find(item => item.id === reservationId);
    if (reservation?.state !== "reserved") return;
    const ledger = findLedger(reservation.dispatcherMarketId);
    if (!ledger) return;

    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "land") continue;
      const balance = ledger.landAssets.find(asset => asset.assetId === allocation.transportId);
      if (!balance) continue;
      balance.reserved -= ownUnits(allocation);
      balance.inTransit += ownUnits(allocation);
      assertBalance(balance);
    }
    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "river") continue;
      const balance = ledger.riverAssets.find(asset => asset.assetId === allocation.transportId);
      if (!balance) continue;
      balance.reserved -= allocation.unitCount;
      balance.inTransit += allocation.unitCount;
      ledger.riverDeparturesThisCycle = (ledger.riverDeparturesThisCycle ?? 0) + allocation.unitCount;
      assertBalance(balance);
    }
    for (const hullId of reservation.allocations.flatMap(allocation => allocation.shipHullIds ?? [])) {
      const asset = findWaterAsset(hullId);
      if (!asset) continue;
      asset.state = "inTransit";
      delete asset.berthBurgId;
      delete asset.idleDays;
    }
    reservation.state = "inTransit";
  }

  cancel(reservationId: number): void {
    const reservation = getTransportReservations().find(item => item.id === reservationId);
    if (reservation?.state !== "reserved") return;
    const ledger = findLedger(reservation.dispatcherMarketId);
    if (!ledger) return;

    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "land") continue;
      const balance = ledger.landAssets.find(asset => asset.assetId === allocation.transportId);
      if (!balance) continue;
      balance.reserved -= ownUnits(allocation);
      balance.available += ownUnits(allocation);
      releaseHired(balance, allocation);
      assertBalance(balance);
    }
    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "river") continue;
      const balance = ledger.riverAssets.find(asset => asset.assetId === allocation.transportId);
      if (!balance) continue;
      balance.reserved -= allocation.unitCount;
      balance.available += allocation.unitCount;
      assertBalance(balance);
    }
    const hullIds = reservation.allocations.flatMap(allocation => allocation.shipHullIds ?? []);
    const assets = hullIds.map(findWaterAsset);
    for (const asset of assets) {
      if (!asset) continue;
      asset.state = "available";
      asset.reservationId = undefined;
    }
    // Cancel returns the hull to its home port (no destination berth).
    this.releaseShipbuildingHulls(hullIds, "arrived", assets.find(Boolean)?.homeBurgId ?? null);
    reservation.state = "cancelled";
  }

  settleCaravan(
    caravan: Pick<Caravan, "transportReservationId"> & Partial<Pick<Caravan, "buyer" | "buyerType">>,
    outcome: "arrived" | "lost"
  ): void {
    if (caravan.transportReservationId === undefined) return;
    const reservation = getTransportReservations().find(item => item.id === caravan.transportReservationId);
    if (reservation?.state !== "inTransit") return;
    const ledger = findLedger(reservation.dispatcherMarketId);
    if (!ledger) return;

    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "land") continue;
      const balance = ledger.landAssets.find(asset => asset.assetId === allocation.transportId);
      if (!balance) continue;
      const own = ownUnits(allocation);
      balance.inTransit -= own;
      if (outcome === "arrived") balance.available += own;
      else if (own > 0) {
        balance.maintenance += own;
        balance.recoveryDays = MAINTENANCE_RECOVERY_DAYS;
      }
      releaseHired(balance, allocation);
      assertBalance(balance);
    }
    const destinationMarketId =
      caravan.buyerType === "market" && typeof caravan.buyer === "number"
        ? caravan.buyer
        : caravan.buyerType === "burg" && typeof caravan.buyer === "number"
          ? getWorldContext().pack.burgs[caravan.buyer]?.market
          : undefined;
    const destinationLedger =
      typeof destinationMarketId === "number" ? (this.ensureLedger(destinationMarketId) ?? ledger) : ledger;
    const oneWay = isOneWayRiverCraftEra(reservation.dispatcherMarketId);
    for (const allocation of reservation.allocations) {
      if (allocation.mode !== "river") continue;
      const sourceBalance = ledger.riverAssets.find(asset => asset.assetId === allocation.transportId);
      if (!sourceBalance) continue;
      sourceBalance.inTransit -= allocation.unitCount;
      if (oneWay) {
        // Built for this trip: broken up for its wood on arrival, lost with its cargo otherwise.
        if (outcome === "arrived") salvageRiverBarges(destinationMarketId, allocation.unitCount);
        assertBalance(sourceBalance);
        continue;
      }
      let destinationBalance = destinationLedger.riverAssets.find(asset => asset.assetId === allocation.transportId);
      if (!destinationBalance) {
        destinationBalance = {
          assetId: "river-barge",
          available: 0,
          reserved: 0,
          inTransit: 0,
          maintenance: 0,
          recoveryDays: 0
        };
        destinationLedger.riverAssets.push(destinationBalance);
      }
      if (outcome === "arrived") destinationBalance.available += allocation.unitCount;
      else {
        destinationBalance.maintenance += allocation.unitCount;
        destinationBalance.recoveryDays = MAINTENANCE_RECOVERY_DAYS;
      }
      assertBalance(sourceBalance);
    }
    const hullIds = reservation.allocations.flatMap(allocation => allocation.shipHullIds ?? []);
    const destinationBurgId =
      caravan.buyerType === "burg" && typeof caravan.buyer === "number"
        ? caravan.buyer
        : caravan.buyerType === "market" && typeof caravan.buyer === "number"
          ? (getMarketById(caravan.buyer)?.centerBurgId ?? null)
          : null;
    for (const hullId of hullIds) {
      const asset = findWaterAsset(hullId);
      if (!asset) continue;
      asset.state = outcome === "arrived" ? "available" : "maintenance";
      asset.reservationId = undefined;
      // An arrived hull lies at the destination port until it is reserved again (§4.2).
      if (outcome === "arrived" && typeof destinationBurgId === "number") {
        asset.berthBurgId = destinationBurgId;
        asset.idleDays = 0;
      }
    }
    this.releaseShipbuildingHulls(hullIds, outcome, destinationBurgId);
    reservation.state = outcome === "arrived" ? "released" : "lost";
  }

  recoverMaintenance(deltaDays: number): void {
    if (deltaDays <= 0) return;
    this.advanceHullsAtSea(deltaDays);
    for (const ledger of getMerchantTransportLedgers()) {
      for (const balance of ledger.landAssets) {
        if ((balance.hired ?? 0) > 0) balance.hiredDays = (balance.hiredDays ?? 0) + (balance.hired ?? 0) * deltaDays;
        if (balance.maintenance <= 0 || balance.recoveryDays <= 0) continue;
        balance.recoveryDays = Math.max(0, balance.recoveryDays - deltaDays);
        if (balance.recoveryDays > 0) continue;
        balance.available += balance.maintenance;
        balance.maintenance = 0;
        assertBalance(balance);
      }
      for (const balance of ledger.riverAssets) {
        if (balance.maintenance <= 0 || balance.recoveryDays <= 0) continue;
        balance.recoveryDays = Math.max(0, balance.recoveryDays - deltaDays);
        if (balance.recoveryDays > 0) continue;
        balance.available += balance.maintenance;
        balance.maintenance = 0;
        assertBalance(balance);
      }
    }
  }

  /** Free hulls count their days in port; hulls sailing in ballast berth when they arrive. */
  private advanceHullsAtSea(deltaDays: number): void {
    for (const ledger of getMerchantTransportLedgers()) {
      for (const asset of ledger.waterAssets ?? []) {
        if (asset.ballast) {
          asset.ballast.daysLeft -= deltaDays;
          if (asset.ballast.daysLeft > 0) continue;
          const burgId = asset.ballast.toBurgId;
          delete asset.ballast;
          asset.state = "available";
          asset.berthBurgId = burgId;
          asset.idleDays = 0;
          simEvents.dispatchEvent(
            new CustomEvent("fmg:economy-merchant-hull-reposition", { detail: { hullId: asset.shipHullId, burgId } })
          );
          continue;
        }
        if (asset.state === "available" && asset.berthBurgId !== undefined)
          asset.idleDays = (asset.idleDays ?? 0) + deltaDays;
      }
    }
  }

  getAvailability(marketId: number): MerchantTransportAssetAvailability[] {
    const ledger = this.ensureLedger(marketId);
    if (!ledger) return [];
    const landAssets = ledger.landAssets.map(asset => {
      const definition = getLandTransportDefinition(asset.assetId);
      const total = asset.available + asset.reserved + asset.inTransit + asset.maintenance;
      return {
        assetId: asset.assetId,
        assetName: definition?.name ?? asset.assetId,
        cargoCapacitySlots: definition?.cargoCapacitySlots ?? 0,
        available: asset.available,
        reserved: asset.reserved,
        inTransit: asset.inTransit,
        maintenance: asset.maintenance,
        total
      };
    });
    const riverAssets = ledger.riverAssets.map(asset => ({
      assetId: asset.assetId,
      assetName: RIVER_BARGE_TRANSPORT.name,
      cargoCapacitySlots: RIVER_BARGE_CARGO_CAPACITY_SLOTS,
      available: asset.available,
      reserved: asset.reserved,
      inTransit: asset.inTransit,
      maintenance: asset.maintenance,
      total: asset.available + asset.reserved + asset.inTransit + asset.maintenance
    }));
    return [...landAssets, ...riverAssets, ...ledger.waterAssets.map(getWaterAssetAvailability)];
  }

  /** Largest single ready land vehicle for a route; callers use it to form a shippable partial manifest. */
  getLargestAvailableLandCapacity(marketId: number, draftAnimalId: string): number {
    const draftAnimal = getDraftAnimalType(draftAnimalId);
    const ledger = findLedger(marketId);
    // A kind with none of its own free can still be hired while the carriers have some to lend (§3).
    const canHire = (assetId: string) => {
      const balance = ledger?.landAssets.find(asset => asset.assetId === assetId);
      return balance ? (balance.hired ?? 0) < hireCap(balance) : false;
    };
    return this.getAvailability(marketId).reduce((largest, asset) => {
      if (asset.available <= 0 && !canHire(asset.assetId)) return largest;
      const definition = getLandTransportDefinition(asset.assetId);
      if (!definition) return largest;
      const capacity = Math.min(
        definition.cargoCapacitySlots,
        definition.requiredDraftAnimals * draftAnimal.towCapacitySlots
      );
      return Math.max(largest, capacity);
    }, 0);
  }

  /**
   * Cargo slots the market's whole fleet of one mode carries at once, out on the road or not;
   * vehicles in repair do not count (long-distance-merchant-reach-capital.md §17).
   */
  getFleetCapacitySlots(marketId: number, mode: "land" | "sea", draftAnimalId: string): number {
    const ledger = this.ensureLedger(marketId);
    if (!ledger) return 0;
    if (mode === "sea") {
      return ledger.waterAssets
        .filter(asset => asset.state !== "maintenance")
        .reduce((sum, asset) => sum + (getShipDefinition(asset.shipClassId)?.cargoCapacitySlots ?? 0), 0);
    }
    const draftAnimal = getDraftAnimalType(draftAnimalId);
    return ledger.landAssets.reduce((sum, asset) => {
      const definition = getLandTransportDefinition(asset.assetId);
      if (!definition) return sum;
      const capacity = Math.min(
        definition.cargoCapacitySlots,
        definition.requiredDraftAnimals * draftAnimal.towCapacitySlots
      );
      return sum + capacity * (asset.available + asset.reserved + asset.inTransit);
    }, 0);
  }

  /**
   * Cargo slots of other markets' free hulls lying at this market's ports. A merchant without a
   * ship of his own paid freight on whatever ship lay in port (port-freight-queue-and-warehouses.md §4.2).
   */
  getCharterableSeaCapacitySlots(marketId: number): number {
    let slots = 0;
    for (const ledger of getMerchantTransportLedgers()) {
      if (ledger.marketId === marketId) continue;
      for (const asset of ledger.waterAssets ?? []) {
        if (asset.state !== "available" || berthMarketId(asset) !== marketId) continue;
        slots += getShipDefinition(asset.shipClassId)?.cargoCapacitySlots ?? 0;
      }
    }
    return slots;
  }

  /**
   * Hired vehicles of one kind the market kept on the road on average since the last call, and
   * resets the count. The market orders that many of its own (§3.2).
   */
  takeHiredVehicleAverage(marketId: number, assetId: MerchantLandAssetBalance["assetId"], cycleDays: number): number {
    const balance = findLedger(marketId)?.landAssets.find(asset => asset.assetId === assetId);
    if (!balance) return 0;
    const days = balance.hiredDays ?? 0;
    balance.hiredDays = undefined;
    return cycleDays > 0 ? days / cycleDays : 0;
  }

  /**
   * Hulls that have lain free in port for two months, where neither their own market nor the port's
   * has sea cargo waiting, sail empty to the ports where cargo waits, as tramp ships went where
   * freight ran high (§4.5). The passage takes its days and the hull is out of use meanwhile, so a
   * ship that can find a freight where she lies takes it first. Ownership and home port stay. At
   * most half of one market's idle hulls leave in one cycle. Returns the departures.
   */
  repositionIdleHulls(
    backlogSlots: ReadonlyMap<number, number>,
    portOf: (marketId: number) => number | undefined
  ): { hullId: number; marketId: number; burgId: number; days: number }[] {
    if (!this.waterAssetModeActive) return [];
    const need = new Map<number, number>();
    for (const [marketId, slots] of backlogSlots) {
      const lying =
        this.getCharterableSeaCapacitySlots(marketId) +
        this.availableOwnSeaSlots(marketId) +
        this.ballastInboundSlots(marketId);
      const left = slots - lying;
      if (left > 0 && portOf(marketId) !== undefined) need.set(marketId, left);
    }
    if (!need.size) return [];
    const burgs = getWorldContext().pack.burgs ?? [];
    const kmPerMapUnit = getWorldContext().distanceScale || 1;
    const seaKmPerDay = Math.max(1, CaravanMovement.getOptions().seaKmPerDay);
    const passageDays = (fromBurgId: number, toBurgId: number): number => {
      const from = burgs[fromBurgId];
      const to = burgs[toBurgId];
      if (!from || !to) return Number.POSITIVE_INFINITY;
      const km = Math.hypot(to.x - from.x, to.y - from.y) * kmPerMapUnit * BALLAST_DETOUR;
      return Math.max(1, Math.ceil((km / seaKmPerDay) * BALLAST_SLOWNESS));
    };
    const departures: { hullId: number; marketId: number; burgId: number; days: number }[] = [];
    for (const ledger of getMerchantTransportLedgers()) {
      if ((backlogSlots.get(ledger.marketId) ?? 0) > 0) continue;
      const idle = (ledger.waterAssets ?? []).filter(asset => {
        if (asset.state !== "available" || asset.berthBurgId === undefined) return false;
        if ((asset.idleDays ?? 0) < BALLAST_MIN_IDLE_DAYS) return false;
        return (backlogSlots.get(berthMarketId(asset) ?? -1) ?? 0) <= 0;
      });
      let budget = Math.ceil(idle.length / 2);
      for (const asset of idle) {
        if (budget <= 0 || !need.size) break;
        const from = asset.berthBurgId as number;
        // The nearer of two waiting ports wins unless the farther waits for much more.
        let best: { marketId: number; burgId: number; days: number; score: number } | null = null;
        for (const [marketId, left] of need) {
          const burgId = portOf(marketId);
          if (burgId === undefined || berthMarketId(asset) === marketId) continue;
          const days = passageDays(from, burgId);
          if (!Number.isFinite(days)) continue;
          const score = left / (days + 30);
          if (!best || score > best.score || (score === best.score && marketId < best.marketId))
            best = { marketId, burgId, days, score };
        }
        if (!best) break;
        asset.state = "inTransit";
        asset.ballast = { toBurgId: best.burgId, daysLeft: best.days };
        delete asset.berthBurgId;
        delete asset.idleDays;
        departures.push({ hullId: asset.shipHullId, marketId: best.marketId, burgId: best.burgId, days: best.days });
        budget -= 1;
        const left = (need.get(best.marketId) ?? 0) - (getShipDefinition(asset.shipClassId)?.cargoCapacitySlots ?? 0);
        if (left > 0) need.set(best.marketId, left);
        else need.delete(best.marketId);
      }
      if (!need.size) break;
    }
    return departures;
  }

  /** Cargo slots of hulls already sailing in ballast to this market's ports. */
  private ballastInboundSlots(marketId: number): number {
    const burgs = getWorldContext().pack.burgs ?? [];
    let slots = 0;
    for (const ledger of getMerchantTransportLedgers())
      for (const asset of ledger.waterAssets ?? [])
        if (asset.ballast && burgs[asset.ballast.toBurgId]?.market === marketId)
          slots += getShipDefinition(asset.shipClassId)?.cargoCapacitySlots ?? 0;
    return slots;
  }

  private availableOwnSeaSlots(marketId: number): number {
    return (findLedger(marketId)?.waterAssets ?? [])
      .filter(asset => asset.state === "available")
      .reduce((sum, asset) => sum + (getShipDefinition(asset.shipClassId)?.cargoCapacitySlots ?? 0), 0);
  }

  /** Whether sea legs need one of the market's own hulls (Shipbuilding publishes a finite fleet). */
  needsOwnHulls(): boolean {
    return this.waterAssetModeActive;
  }

  /** Sea cargo that could not be booked for want of hulls since the last replenishment (§17). */
  recordSeaHullShortfall(marketId: number, cargoSlots: number): void {
    if (!(cargoSlots > 0)) return;
    const ledger = this.ensureLedger(marketId);
    if (!ledger) return;
    ledger.seaShortfallSlots = (ledger.seaShortfallSlots ?? 0) + cargoSlots;
  }

  /** The sea shortfall recorded since the last replenishment, left in place. */
  peekSeaHullShortfall(marketId: number): number {
    return findLedger(marketId)?.seaShortfallSlots ?? 0;
  }

  /** Reads and resets the sea shortfall recorded since the last replenishment. */
  takeSeaHullShortfall(marketId: number): number {
    const ledger = findLedger(marketId);
    if (!ledger) return 0;
    const shortfall = ledger.seaShortfallSlots ?? 0;
    ledger.seaShortfallSlots = undefined;
    return shortfall;
  }

  /** The largest shipment that can be assigned without bypassing a physical mode's capacity. */
  getLargestAvailableRouteCapacity(
    marketId: number,
    routeSegments: readonly TradeRouteSegment[],
    draftAnimalId: string
  ): number {
    const modes = new Set(routeSegments.map(segment => segment.type));
    const capacities: number[] = [];
    if (modes.has("land")) capacities.push(this.getLargestAvailableLandCapacity(marketId, draftAnimalId));
    if (modes.has("water") && this.waterAssetModeActive) {
      capacities.push(
        this.getAvailability(marketId)
          .filter(asset => asset.assetId.startsWith("hull-") && asset.available > 0)
          .reduce((largest, asset) => Math.max(largest, asset.cargoCapacitySlots), 0)
      );
    }
    if (modes.has("river")) {
      capacities.push(
        this.getAvailability(marketId)
          .filter(asset => asset.assetId === "river-barge" && asset.available > 0)
          .reduce((largest, asset) => Math.max(largest, asset.cargoCapacitySlots), 0)
      );
    }
    return capacities.length ? Math.min(...capacities) : Number.POSITIVE_INFINITY;
  }

  getReservation(reservationId: number | undefined): TransportReservation | undefined {
    return reservationId === undefined ? undefined : getTransportReservations().find(item => item.id === reservationId);
  }

  /** Credits completed land assets directly to the durable ledger, bypassing saleable market stock. */
  addAvailableLandAssets(marketId: number, assetId: MerchantLandAssetBalance["assetId"], quantity: number): void {
    if (!(quantity > 0)) return;
    const ledger = this.ensureLedger(marketId);
    const balance = ledger?.landAssets.find(asset => asset.assetId === assetId);
    if (!balance) return;
    balance.available += quantity;
    assertBalance(balance);
  }

  /** A loading pass found river cargo but no free barge at `marketId` (§10: barges are built to demand). */
  recordRiverBargeShortfall(marketId: number, cargoSlots: number): void {
    if (!(cargoSlots > 0)) return;
    const ledger = this.ensureLedger(marketId);
    if (!ledger) return;
    ledger.riverShortfallSlots = (ledger.riverShortfallSlots ?? 0) + cargoSlots;
  }

  /**
   * Barges a market should have built or building this cycle: enough for the river cargo that
   * waited for one, plus — while craft are one-way — about a cycle's usual departures built ahead
   * where the river trade is steady. Resets the cycle's shortfall and departure counts.
   */
  takeRiverBargeTarget(marketId: number): number {
    const ledger = findLedger(marketId);
    if (!ledger) return 0;
    const departures = ledger.riverDeparturesThisCycle ?? 0;
    const smoothed =
      (ledger.riverDeparturesPerCycle ?? 0) * (1 - RIVER_DEPARTURE_SMOOTHING) + departures * RIVER_DEPARTURE_SMOOTHING;
    ledger.riverDeparturesPerCycle = smoothed > 0.01 ? smoothed : undefined;
    ledger.riverDeparturesThisCycle = undefined;
    const shortfall = Math.ceil((ledger.riverShortfallSlots ?? 0) / RIVER_BARGE_CARGO_CAPACITY_SLOTS - 0.000001);
    ledger.riverShortfallSlots = undefined;
    const prebuilt =
      isOneWayRiverCraftEra(marketId) && smoothed >= RIVER_PREBUILD_MIN_DEPARTURES_PER_CYCLE ? Math.floor(smoothed) : 0;
    const balance = ledger.riverAssets.find(asset => asset.assetId === "river-barge");
    const ready = (balance?.available ?? 0) + (balance?.maintenance ?? 0);
    return Math.max(0, shortfall + prebuilt - ready);
  }

  /** Credits completed shallow-draft vessels to Economy's aggregate river-asset ledger. */
  addAvailableRiverAssets(marketId: number, quantity: number): void {
    if (!(quantity > 0)) return;
    const ledger = this.ensureLedger(marketId);
    if (!ledger) return;
    const balance = ledger.riverAssets.find(asset => asset.assetId === "river-barge");
    if (balance) balance.available += quantity;
    else {
      ledger.riverAssets.push({
        assetId: "river-barge",
        available: quantity,
        reserved: 0,
        inTransit: 0,
        maintenance: 0,
        recoveryDays: 0
      });
    }
  }

  clear(): void {
    this.waterAssetModeActive = false;
    setMerchantTransportLedgers([]);
    setTransportReservations([]);
    setNextTransportReservationId(0);
  }
}

export const MerchantTransportAssets = new MerchantTransportAssetsModule();
