import { isTechnologyAtLeast } from "../../../generators/technologyProgress";
import { simEvents } from "../../../simulation/events";
import { SHIP_CLASS_DEFINITIONS, type ShipbuildingMerchantHullSnapshot } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getCaravans,
  getFlowCycleHistory,
  getGoods,
  getMarketById,
  getMerchantOrganizations,
  getMerchantTransportLedgers,
  getNextTransportReservationId,
  getSimulationMonth,
  getTransportReservations,
  getWorldContext,
  setMerchantTransportLedgers,
  setNextTransportReservationId,
  setTransportReservations
} from "../economyContext";
import { CaravanMovement, getDraftAnimalType } from "./caravanMovement";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { getLocalCarrierSeasonFactor } from "./harvestCarriers";
import {
  type LandFleetSeedCounts,
  landFleetCountsFromBurgScale,
  mergeLandFleetCounts,
  sizeLandFleetFromAnnualExportSlots
} from "./marketFlowBudget";
import { buildFlowReportSummary } from "./marketFlowReport";
import { getMarketRuralPopulation } from "./marketPopulation";
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
import { seaDepartureMarketId, stageSegments } from "./seaRoutePorts";
import { isSeaClosed } from "./seaSeason";
import { getLandTransportDefinition, RIVER_BARGE_TRANSPORT } from "./tradeCargo";

const MAINTENANCE_RECOVERY_DAYS = 30;
/**
 * Days a free hull the port's own demand does not need lies there before she sails in ballast, home
 * for her owner's cargo or to another port where cargo waits or is expected. A master looked for a
 * freight where he lay, so a ship carried cargo round a triangle rather than in ballast (§4.5,
 * §10.6, §10.8, §10.10).
 */
const BALLAST_MIN_IDLE_DAYS = 14;
/**
 * Days a free hull lies idle at a foreign port, with no freight there or anywhere she might sail
 * for, before she goes home to lie up: ships were laid up where their owners could tend them
 * (port-freight-queue-and-warehouses.md §10.10).
 */
const LAY_UP_MIN_IDLE_DAYS = 60;
/** A hull of the exporter's own lying free within this many days' passage counts as coming in (§4.2). */
const INBOUND_HORIZON_DAYS = 30;
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
/**
 * Share of the vehicles that stood free at home all cycle, beyond what the measured trade needs,
 * that a market lets go each cycle. A carrier did not keep a team eating in the stable for want of
 * freight: idle carts and beasts were sold to peasants and local carters (§10.13).
 */
const IDLE_LAND_ASSET_RELEASE_SHARE = 0.25;
/**
 * Cycles in a row a kind must stand partly idle before any goes. Trade ran by the season: grain
 * moved after harvest and roads closed in winter, and a carrier kept his teams through a slack
 * season he knew would end.
 */
const IDLE_LAND_ASSET_RELEASE_CYCLES = 6;
/**
 * Vehicles of each kind a market's people lend for hire, per thousand rural people. One vehicle
 * here is a convoy of some twenty carts (§10.13). Peasants carted for hire between field work, and
 * town carters plied for any merchant: a market of a hundred and fifty thousand country people
 * could find thirty convoys of carts to hire without a merchant owning one (§10.14). Twenty beasts
 * on hire at once per thousand: Shinano's licensed peasant carriers (chūma, 1764) kept some 27
 * horses per thousand people, and England's farms about a hundred per thousand country people in
 * 1871 (§10.26).
 */
const LOCAL_CARRIERS_PER_THOUSAND_RURAL = { packTrain: 0.2, cart: 0.2, wagon: 0.1 } as const;
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

/**
 * Annual export cargo slots measured over the A0 flow cycles, 0 before they accumulate. The soft
 * estimate from retail stock that used to stand in sized markets for a million slots a year, and
 * gave every early market the largest fleet free; vehicles are now added only for trade that
 * has been seen (port-freight-queue-and-warehouses.md §10.13).
 */
export function estimateMarketAnnualExportCargoSlots(marketId: number): number {
  const history = getFlowCycleHistory();
  if (history.length < FLOW_FLEET_TOPUP_MIN_CYCLES) return 0;
  return buildFlowReportSummary(history)
    .rows.filter(row => row.marketId === marketId)
    .reduce((sum, row) => sum + row.exportSlots, 0);
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

/**
 * The fleet a market's measured trade needs, one of each kind at least. A new market is seeded to
 * its burg floor, but only this many are topped up for free, kept through a slack season, or kept
 * back from sale (§10.13): the burg floor gave a fifty-burg market of the world map twenty-six carts
 * that never left the yard.
 */
export function computeLandFleetNeedCounts(marketId: number): LandFleetSeedCounts {
  const fromExport = sizeLandFleetFromAnnualExportSlots({
    annualExportCargoSlots: estimateMarketAnnualExportCargoSlots(marketId)
  });
  return mergeLandFleetCounts({ packTrain: 1, cart: 1, wagon: 1 }, fromExport);
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
 * Called after flow diagnostics accumulate so the seed can catch up with measured trade.
 */
function topUpLandAssets(ledger: MerchantTransportLedger): void {
  const desired = computeLandFleetNeedCounts(ledger.marketId);
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

/**
 * Hired vehicles one kind may add: the market's own count of that kind times the hire share, and
 * at least what its local carriers lend (`refreshLocalCarriers`). Months of heavy field work take
 * part of both (§10.27).
 */
function hireCap(balance: MerchantLandAssetBalance, ledger: MerchantTransportLedger | undefined): number {
  const local = ledger?.localCarriers;
  const localCount = !local
    ? 0
    : balance.assetId === "pack-train"
      ? local.packTrain
      : balance.assetId === "cart"
        ? local.cart
        : local.wagon;
  const season = ledger?.localCarrierSeasonFactor ?? 1;
  return Math.max(Math.floor(landAssetTotal(balance) * LAND_HIRE_SHARE * season), Math.floor(localCount * season));
}

/** Removes `count` vehicles' share of the horses the market paid for, and returns it. */
function takeDraftAnimalHeads(balance: MerchantLandAssetBalance, count: number): number {
  const heads = balance.draftAnimalHeads ?? 0;
  const total = landAssetTotal(balance);
  if (!(heads > 0) || !(total > 0)) return 0;
  const taken = rn((heads * Math.min(count, total)) / total, 4);
  balance.draftAnimalHeads = heads - taken > 0.0001 ? rn(heads - taken, 4) : undefined;
  return taken;
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

function homeMarketId(asset: MerchantWaterAssetReference): number | null {
  const marketId = getWorldContext().pack.burgs?.[asset.homeBurgId]?.market;
  return typeof marketId === "number" ? marketId : null;
}

/**
 * Whether a free hull lies at one of the market's ports and can take cargo there. A hull serves
 * only the port she lies in, her owner's cargo included (§10.6): a ship that delivered at a far
 * port finds her next freight there or sails back. A free hull whose berth is not known lies at
 * her home port.
 */
function isFreeAt(asset: MerchantWaterAssetReference, portMarketId: number): boolean {
  if (asset.state !== "available" || asset.ballast) return false;
  const lying = asset.berthBurgId === undefined ? homeMarketId(asset) : berthMarketId(asset);
  return lying === portMarketId;
}

/** Days a light hull takes from port to port: the coastal track at an unhurried pace. */
function ballastPassageDays(fromBurgId: number, toBurgId: number): number {
  const burgs = getWorldContext().pack.burgs ?? [];
  const from = burgs[fromBurgId];
  const to = burgs[toBurgId];
  if (!from || !to) return Number.POSITIVE_INFINITY;
  const kmPerMapUnit = getWorldContext().distanceScale || 1;
  const seaKmPerDay = Math.max(1, CaravanMovement.getOptions().seaKmPerDay);
  const km = Math.hypot(to.x - from.x, to.y - from.y) * kmPerMapUnit * BALLAST_DETOUR;
  return Math.max(1, Math.ceil((km / seaKmPerDay) * BALLAST_SLOWNESS));
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
      /** Market of the port the sea leg leaves from; hulls lying there may be chartered (§10.7). */
      seaPortMarketId?: number;
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
      balances.some(
        ({ balance, hired }) => !balance || (hired > 0 && (balance.hired ?? 0) + hired > hireCap(balance, ledger))
      )
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

    const waterAllocations = this.allocateWaterAssets(ledger, allocations, itinerary?.seaPortMarketId);
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
    allocations: readonly TransportAllocation[],
    portMarketId: number = ledger.marketId
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
        .filter(asset => isFreeAt(asset, portMarketId))
        .map(asset => ({ asset, definition: getShipDefinition(asset.shipClassId) }))
        .filter((entry): entry is Entry => Boolean(entry.definition));
    // Only hulls lying at the port the cargo sails from take it, the market's own first (§10.6).
    // Hulls of other markets lying there take freight as well (§4.2); for a market without a
    // port, that is another market's port (§10.7).
    const available = entriesOf(ledger.waterAssets);
    const chartered = entriesOf(
      getMerchantTransportLedgers()
        .filter(other => other.marketId !== ledger.marketId)
        .flatMap(other => other.waterAssets ?? [])
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

  /**
   * Ends a caravan's use of its vehicles. Arrived, they are free again; lost on the way (its cargo
   * spoiled away), they come home through repair. Raided by bandits or soldiers (TradeSecurity),
   * the market's own convoys are gone with the horses it paid for: raiders drove off the teams and
   * kept or burnt the carts (port-freight-queue-and-warehouses.md §10.21). Hired vehicles were their
   * carriers' loss. A raided barge is gone too; a raided hull goes to repair as a lost one does.
   */
  settleCaravan(
    caravan: Pick<Caravan, "transportReservationId"> & Partial<Pick<Caravan, "buyer" | "buyerType">>,
    outcome: "arrived" | "lost" | "raided"
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
      if (outcome === "raided") takeDraftAnimalHeads(balance, own);
      balance.inTransit -= own;
      if (outcome === "arrived") balance.available += own;
      else if (outcome === "lost" && own > 0) {
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
      if (oneWay || outcome === "raided") {
        // Built for this trip: broken up for its wood on arrival, lost with its cargo otherwise.
        // A raided barge is lost in any era.
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
    this.releaseShipbuildingHulls(hullIds, outcome === "arrived" ? "arrived" : "lost", destinationBurgId);
    reservation.state = outcome === "arrived" ? "released" : "lost";
  }

  recoverMaintenance(deltaDays: number): void {
    if (deltaDays <= 0) return;
    this.advanceHullsAtSea(deltaDays);
    for (const ledger of getMerchantTransportLedgers()) {
      for (const balance of ledger.landAssets) {
        if ((balance.hired ?? 0) > 0) balance.hiredDays = (balance.hiredDays ?? 0) + (balance.hired ?? 0) * deltaDays;
        balance.idleLowWater = Math.min(balance.idleLowWater ?? balance.available, balance.available);
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

  /** Plan a port consignment's road convoy from free vehicles first, then remaining hire capacity. */
  getAvailableLandConvoy(marketId: number, slots: number, draftAnimalId: string): TransportAllocation[] | null {
    const ledger = this.ensureLedger(marketId);
    if (!ledger || !(slots > 0) || !Number.isFinite(slots)) return null;
    const animal = getDraftAnimalType(draftAnimalId);
    const options = ledger.landAssets
      .flatMap(balance => {
        const definition = getLandTransportDefinition(balance.assetId);
        if (!definition) return [];
        const capacity = Math.min(
          definition.cargoCapacitySlots,
          definition.requiredDraftAnimals * animal.towCapacitySlots
        );
        return capacity > 0 ? [{ balance, definition, capacity }] : [];
      })
      .sort((a, b) => b.capacity - a.capacity);
    const allocations = new Map<string, TransportAllocation>();
    let remaining = slots;
    for (const hired of [false, true]) {
      for (const { balance, definition, capacity } of options) {
        const available = Math.max(
          0,
          Math.floor(hired ? hireCap(balance, ledger) - (balance.hired ?? 0) : balance.available)
        );
        const count = Math.min(available, Math.ceil((remaining - 0.000001) / capacity));
        if (count <= 0) continue;
        const usedSlots = Math.min(remaining, count * capacity);
        const allocation = allocations.get(definition.id) ?? {
          mode: "land",
          transportId: definition.id,
          transportName: definition.name,
          unitCount: 0,
          capacitySlots: 0,
          usedSlots: 0,
          draftAnimalId,
          requiredDraftAnimals: definition.requiredDraftAnimals
        };
        allocation.unitCount += count;
        allocation.capacitySlots += count * capacity;
        allocation.usedSlots += usedSlots;
        allocations.set(definition.id, allocation);
        remaining -= usedSlots;
        if (remaining <= 0.000001) return [...allocations.values()];
      }
    }
    return null;
  }

  /** Largest single ready land vehicle for a route; callers use it to form a shippable partial manifest. */
  getLargestAvailableLandCapacity(marketId: number, draftAnimalId: string): number {
    const draftAnimal = getDraftAnimalType(draftAnimalId);
    const ledger = findLedger(marketId);
    // A kind with none of its own free can still be hired while the carriers have some to lend (§3).
    const canHire = (assetId: string) => {
      const balance = ledger?.landAssets.find(asset => asset.assetId === assetId);
      return balance ? (balance.hired ?? 0) < hireCap(balance, ledger) : false;
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
  /**
   * Counts the carts and teams the market's countryside and towns lend for hire: the burg floor
   * that used to be handed to the merchants free, or more where the countryside is large (§10.14),
   * and how many of them field work leaves free this month (§10.27).
   */
  refreshLocalCarriers(marketId: number): void {
    const ledger = findLedger(marketId);
    if (!ledger) return;
    const world = getWorldContext();
    const burgCount = (world.pack.burgs ?? []).filter(burg => !burg.removed && burg.market === marketId).length;
    const rural = world.pack.cells?.i ? getMarketRuralPopulation(world, marketId) / 1000 : 0;
    ledger.localCarriers = mergeLandFleetCounts(landFleetCountsFromBurgScale(burgCount), {
      packTrain: Math.floor(rural * LOCAL_CARRIERS_PER_THOUSAND_RURAL.packTrain),
      cart: Math.floor(rural * LOCAL_CARRIERS_PER_THOUSAND_RURAL.cart),
      wagon: Math.floor(rural * LOCAL_CARRIERS_PER_THOUSAND_RURAL.wagon)
    });
    const season = getLocalCarrierSeasonFactor(marketId, getSimulationMonth());
    ledger.localCarrierSeasonFactor = season < 1 ? season : undefined;
  }

  /** Cargo slots of the land vehicles the market may hire at once (`hireCap` of each kind). */
  getHireableLandCapacitySlots(marketId: number, draftAnimalId: string): number {
    const ledger = this.ensureLedger(marketId);
    if (!ledger) return 0;
    const draftAnimal = getDraftAnimalType(draftAnimalId);
    return ledger.landAssets.reduce((sum, asset) => {
      const definition = getLandTransportDefinition(asset.assetId);
      if (!definition) return sum;
      const capacity = Math.min(
        definition.cargoCapacitySlots,
        definition.requiredDraftAnimals * draftAnimal.towCapacitySlots
      );
      return sum + capacity * hireCap(asset, ledger);
    }, 0);
  }

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
   * Cargo slots of other markets' free hulls lying at the ports of `portMarketId` (by default the
   * market's own). A merchant without a ship of his own paid freight on whatever ship lay in port
   * (port-freight-queue-and-warehouses.md §4.2); a market without a port charters at the port its
   * cargo sails from (§10.7).
   */
  getCharterableSeaCapacitySlots(marketId: number, portMarketId: number = marketId): number {
    let slots = 0;
    for (const ledger of getMerchantTransportLedgers()) {
      if (ledger.marketId === marketId) continue;
      for (const asset of ledger.waterAssets ?? []) {
        if (!isFreeAt(asset, portMarketId)) continue;
        slots += getShipDefinition(asset.shipClassId)?.cargoCapacitySlots ?? 0;
      }
    }
    return slots;
  }

  /**
   * Cargo slots of the hulls an exporter can load at the port its sea leg leaves from now (§4.2,
   * §10.6): free hulls of any owner lying there, and its own hulls coming in — sailing there in
   * ballast, or lying free within a month's passage, as they sail home for its cargo. A hull at sea
   * with cargo does not count: she ends her voyage at the far port and serves the cargo there or
   * comes back in ballast. Its own hulls lying farther off serve the cargo where they lie.
   */
  getSeaRoomCapacitySlots(marketId: number, portMarketId: number = marketId, portBurgId?: number): number {
    return this.getSeaRoomHulls(marketId, portMarketId, portBurgId).reduce((sum, hull) => sum + hull.capacity, 0);
  }

  /** Physical hulls behind booking room; shared hull IDs prevent two exporters booking one ship. */
  getSeaRoomHulls(marketId: number, portMarketId: number = marketId, portBurgId?: number) {
    const burgs = getWorldContext().pack.burgs ?? [];
    const port = portBurgId ?? getMarketById(portMarketId)?.centerBurgId;
    const comingIn = (asset: MerchantWaterAssetReference): boolean => {
      if (asset.ballast) return burgs[asset.ballast.toBurgId]?.market === portMarketId;
      return (
        asset.state === "available" &&
        asset.berthBurgId !== undefined &&
        port !== undefined &&
        ballastPassageDays(asset.berthBurgId, port) <= INBOUND_HORIZON_DAYS
      );
    };
    const hulls: { hullId: number; capacity: number }[] = [];
    for (const ledger of getMerchantTransportLedgers())
      for (const asset of ledger.waterAssets ?? [])
        if (isFreeAt(asset, portMarketId) || (ledger.marketId === marketId && comingIn(asset)))
          hulls.push({
            hullId: asset.shipHullId,
            capacity: getShipDefinition(asset.shipClassId)?.cargoCapacitySlots ?? 0
          });
    return hulls;
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
   * Free hulls set out in ballast for the ports where sea cargo waits or is expected, as tramp ships
   * went where freight ran high, and to the ports a harvest or a season's trade was known to fill
   * (§4.5, §10.10). `demandSlots` gives each market's sea cargo, by the market whose port it sails
   * from: what waits for a ship, or about a month's usual departures where that is more.
   *
   * A hull takes cargo only where she lies (§10.6), and one that can find a freight where she lies
   * takes it first: a port keeps as many of its free hulls as its own demand fills, its owner's own
   * first, and only the rest may sail. A hull lying at a foreign port for two weeks sails home if
   * her owner has demand, or else to the port with the most demand for its distance, so ships that
   * delivered where no freight offers do not pile up there (§10.8). A laid-up hull at her home
   * port, beyond what the port's demand keeps, puts out the same way once freight offers. One that
   * finds nowhere to go for two months goes home to lie up. Runs every day. The passage takes its
   * days and the hull is out of use meanwhile. Ownership and home port stay. Returns the departures.
   */
  repositionIdleHulls(
    demandSlots: ReadonlyMap<number, number>,
    portOf: (marketId: number) => number | undefined
  ): { hullId: number; marketId: number; burgId: number; days: number }[] {
    if (!this.waterAssetModeActive) return [];
    const capacityOf = (asset: MerchantWaterAssetReference) =>
      getShipDefinition(asset.shipClassId)?.cargoCapacitySlots ?? 0;

    // Free hulls by the market of the port they lie at; each port keeps what its demand fills.
    const lyingByMarket = new Map<number, { asset: MerchantWaterAssetReference; owner: number }[]>();
    for (const ledger of getMerchantTransportLedgers())
      for (const asset of ledger.waterAssets ?? []) {
        if (asset.state !== "available" || asset.ballast || asset.berthBurgId === undefined) continue;
        const at = berthMarketId(asset);
        if (at === null) continue;
        const list = lyingByMarket.get(at) ?? [];
        list.push({ asset, owner: ledger.marketId });
        lyingByMarket.set(at, list);
      }
    const releasable = new Set<MerchantWaterAssetReference>();
    for (const [marketId, list] of lyingByMarket) {
      list.sort(
        (left, right) =>
          Number(right.owner === marketId) - Number(left.owner === marketId) ||
          (left.asset.idleDays ?? 0) - (right.asset.idleDays ?? 0) ||
          left.asset.shipHullId - right.asset.shipHullId
      );
      let kept = 0;
      const demand = demandSlots.get(marketId) ?? 0;
      for (const { asset } of list) {
        if (kept < demand) kept += capacityOf(asset);
        else releasable.add(asset);
      }
    }

    const need = new Map<number, number>();
    for (const [marketId, slots] of demandSlots) {
      const lying = this.freeSlotsLyingAt(marketId) + this.ballastInboundSlots(marketId);
      const left = slots - lying;
      if (left > 0 && portOf(marketId) !== undefined) need.set(marketId, left);
    }
    const departures: { hullId: number; marketId: number; burgId: number; days: number }[] = [];
    const sail = (asset: MerchantWaterAssetReference, marketId: number, burgId: number, days: number) => {
      asset.state = "inTransit";
      asset.ballast = { toBurgId: burgId, daysLeft: days };
      delete asset.berthBurgId;
      delete asset.idleDays;
      departures.push({ hullId: asset.shipHullId, marketId, burgId, days });
      const left = (need.get(marketId) ?? 0) - capacityOf(asset);
      if (left > 0) need.set(marketId, left);
      else need.delete(marketId);
    };
    // The nearer of two waiting ports wins unless the farther waits for much more.
    const bestPort = (asset: MerchantWaterAssetReference) => {
      let best: { marketId: number; burgId: number; days: number; score: number } | null = null;
      for (const [marketId, left] of need) {
        const burgId = portOf(marketId);
        if (burgId === undefined || berthMarketId(asset) === marketId) continue;
        const days = ballastPassageDays(asset.berthBurgId as number, burgId);
        if (!Number.isFinite(days)) continue;
        const score = left / (days + 30);
        if (!best || score > best.score || (score === best.score && marketId < best.marketId))
          best = { marketId, burgId, days, score };
      }
      return best;
    };
    for (const ledger of getMerchantTransportLedgers()) {
      const home = portOf(ledger.marketId);
      // A hull laid up for the winter or iced in stays where she lies until the port opens (§10.27).
      const ready = (ledger.waterAssets ?? []).filter(
        asset =>
          releasable.has(asset) && (asset.idleDays ?? 0) >= BALLAST_MIN_IDLE_DAYS && !isSeaClosed(asset.berthBurgId)
      );
      const isAbroad = (asset: MerchantWaterAssetReference) => berthMarketId(asset) !== ledger.marketId;
      // While her owner has demand, a hull abroad sails home, the nearest first.
      if (home !== undefined && need.has(ledger.marketId)) {
        const homeward = ready
          .filter(isAbroad)
          .map(asset => ({ asset, days: ballastPassageDays(asset.berthBurgId as number, home) }))
          .filter(entry => Number.isFinite(entry.days))
          .sort((left, right) => left.days - right.days);
        for (const { asset, days } of homeward) {
          if (!need.has(ledger.marketId)) break;
          sail(asset, ledger.marketId, home, days);
        }
        if (need.has(ledger.marketId)) continue;
      }
      for (const asset of ready) {
        if (asset.ballast) continue;
        const best = need.size ? bestPort(asset) : null;
        if (best) sail(asset, best.marketId, best.burgId, best.days);
        else if (home !== undefined && isAbroad(asset) && (asset.idleDays ?? 0) >= LAY_UP_MIN_IDLE_DAYS) {
          // Nowhere to sail for: home to lie up.
          const days = ballastPassageDays(asset.berthBurgId as number, home);
          if (Number.isFinite(days)) sail(asset, ledger.marketId, home, days);
        }
      }
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

  /** Cargo slots of every free hull, of any owner, lying at the market's ports. */
  private freeSlotsLyingAt(marketId: number): number {
    let slots = 0;
    for (const ledger of getMerchantTransportLedgers())
      for (const asset of ledger.waterAssets ?? [])
        if (asset.state === "available" && berthMarketId(asset) === marketId)
          slots += getShipDefinition(asset.shipClassId)?.cargoCapacitySlots ?? 0;
    return slots;
  }

  /** Whether sea legs need one of the market's own hulls (Shipbuilding publishes a finite fleet). */
  needsOwnHulls(): boolean {
    return this.waterAssetModeActive;
  }

  /**
   * Sea cargo that could not be booked for want of hulls since the last replenishment (§17), and
   * the port burg its sea leg leaves from when known (§10.7).
   */
  recordSeaHullShortfall(marketId: number, cargoSlots: number, portBurgId?: number): void {
    if (!(cargoSlots > 0)) return;
    const ledger = this.ensureLedger(marketId);
    if (!ledger) return;
    ledger.seaShortfallSlots = (ledger.seaShortfallSlots ?? 0) + cargoSlots;
    if (portBurgId === undefined) return;
    ledger.seaShortfallByPort ??= {};
    ledger.seaShortfallByPort[portBurgId] = (ledger.seaShortfallByPort[portBurgId] ?? 0) + cargoSlots;
  }

  /**
   * The sea shortfall recorded since the last replenishment, left in place, by the market whose
   * port the cargo sails from. Shortfall with no known port stays with the exporting market.
   */
  peekSeaShortfallByPortMarket(): Map<number, number> {
    const burgs = getWorldContext().pack.burgs ?? [];
    const byMarket = new Map<number, number>();
    for (const entry of this.peekSeaShortfallEntries()) {
      const portMarket = entry.portBurgId === undefined ? undefined : burgs[entry.portBurgId]?.market;
      const marketId = typeof portMarket === "number" ? portMarket : entry.marketId;
      byMarket.set(marketId, (byMarket.get(marketId) ?? 0) + entry.slots);
    }
    return byMarket;
  }

  /** The sea shortfall left in place, by exporting market and, when known, the port it sails from. */
  peekSeaShortfallEntries(): { marketId: number; portBurgId?: number; slots: number }[] {
    const entries: { marketId: number; portBurgId?: number; slots: number }[] = [];
    for (const ledger of getMerchantTransportLedgers()) {
      const total = ledger.seaShortfallSlots ?? 0;
      if (!(total > 0)) continue;
      let placed = 0;
      for (const [burgId, slots] of Object.entries(ledger.seaShortfallByPort ?? {})) {
        entries.push({ marketId: ledger.marketId, portBurgId: Number(burgId), slots });
        placed += slots;
      }
      if (total - placed > 0.000001) entries.push({ marketId: ledger.marketId, slots: total - placed });
    }
    return entries;
  }

  /** The port burg most of the market's unbooked sea cargo would have sailed from. */
  peekSeaShortfallPort(marketId: number): number | undefined {
    let best: { burgId: number; slots: number } | undefined;
    for (const [burgId, slots] of Object.entries(findLedger(marketId)?.seaShortfallByPort ?? {}))
      if (!best || slots > best.slots) best = { burgId: Number(burgId), slots };
    return best?.burgId;
  }

  /** Reads and resets the sea shortfall recorded since the last replenishment. */
  takeSeaHullShortfall(marketId: number): number {
    const ledger = findLedger(marketId);
    if (!ledger) return 0;
    const shortfall = ledger.seaShortfallSlots ?? 0;
    ledger.seaShortfallSlots = undefined;
    ledger.seaShortfallByPort = undefined;
    return shortfall;
  }

  /**
   * The largest shipment that can be assigned without bypassing a physical mode's capacity. With
   * `awaitVessel`, sea and river cargo is packed for a vessel even when none is free now: it goes
   * down to the port or landing and waits there, as cargo lay on the quay for the next sailing.
   * Waiting sea cargo draws idle hulls to the port, and waiting river cargo has a barge built for
   * it (port-freight-queue-and-warehouses.md §4.1, §10.11). The load is then sized to the largest
   * merchant hull afloat, or to a barge.
   */
  getLargestAvailableRouteCapacity(
    marketId: number,
    routeSegments: readonly TradeRouteSegment[],
    draftAnimalId: string,
    options: { awaitVessel?: boolean } = {}
  ): number {
    const modes = new Set(routeSegments.map(segment => segment.type));
    const capacities: number[] = [];
    if (modes.has("land")) capacities.push(this.getLargestAvailableLandCapacity(marketId, draftAnimalId));
    if ((modes.has("sea") || modes.has("water")) && this.waterAssetModeActive) {
      // The largest free hull, of any owner, lying at the port the sea leg leaves from (§10.6).
      const portMarketId = seaDepartureMarketId(routeSegments) ?? marketId;
      let largest = 0;
      let afloat = 0;
      for (const ledger of getMerchantTransportLedgers())
        for (const asset of ledger.waterAssets ?? []) {
          const slots = getShipDefinition(asset.shipClassId)?.cargoCapacitySlots ?? 0;
          if (isFreeAt(asset, portMarketId)) largest = Math.max(largest, slots);
          if (asset.state !== "maintenance") afloat = Math.max(afloat, slots);
        }
      capacities.push(largest > 0 || !options.awaitVessel ? largest : afloat);
    }
    if (modes.has("river")) {
      const free = this.getAvailability(marketId)
        .filter(asset => asset.assetId === "river-barge" && asset.available > 0)
        .reduce((largest, asset) => Math.max(largest, asset.cargoCapacitySlots), 0);
      capacities.push(free > 0 || !options.awaitVessel ? free : RIVER_BARGE_CARGO_CAPACITY_SLOTS);
    }
    return capacities.length ? Math.min(...capacities) : Number.POSITIVE_INFINITY;
  }

  getReservation(reservationId: number | undefined): TransportReservation | undefined {
    return reservationId === undefined ? undefined : getTransportReservations().find(item => item.id === reservationId);
  }

  /**
   * Lets go a share of the vehicles that stood free at home every day since the last call, above
   * the fleet the market's measured trade needs, once some have stood so for
   * IDLE_LAND_ASSET_RELEASE_CYCLES calls in a row, and restarts the count. A kind the market hired
   * since the last call, or `isStillWanted` says it is building, is kept: its trade ran short on
   * some day even if a few stood free on all of them. Returns how many of each kind went, and
   * the horses (market heads) that went with them, a share of the heads the market paid for.
   */
  releaseIdleLandAssets(
    marketId: number,
    isStillWanted: (assetId: MerchantLandAssetBalance["assetId"]) => boolean = () => false
  ): Partial<Record<MerchantLandAssetBalance["assetId"], { count: number; draftAnimalHeads: number }>> {
    const released: Partial<Record<MerchantLandAssetBalance["assetId"], { count: number; draftAnimalHeads: number }>> =
      {};
    const ledger = findLedger(marketId);
    if (!ledger) return released;
    const keep = computeLandFleetNeedCounts(marketId);
    for (const balance of ledger.landAssets) {
      const idle = Math.min(balance.idleLowWater ?? 0, balance.available);
      balance.idleLowWater = undefined;
      const kept =
        balance.assetId === "pack-train" ? keep.packTrain : balance.assetId === "cart" ? keep.cart : keep.wagon;
      const surplus = Math.min(idle, landAssetTotal(balance) - kept);
      if (
        !(surplus > 0) ||
        (balance.hiredDays ?? 0) > 0 ||
        (balance.hired ?? 0) > 0 ||
        isStillWanted(balance.assetId)
      ) {
        balance.idleCycles = undefined;
        balance.idleSurplus = undefined;
        continue;
      }
      balance.idleCycles = (balance.idleCycles ?? 0) + 1;
      balance.idleSurplus = Math.min(balance.idleSurplus ?? surplus, surplus);
      if (balance.idleCycles < IDLE_LAND_ASSET_RELEASE_CYCLES) continue;
      const count = Math.ceil(balance.idleSurplus * IDLE_LAND_ASSET_RELEASE_SHARE);
      if (!(count > 0)) continue;
      const draftAnimalHeads = takeDraftAnimalHeads(balance, count);
      balance.available -= count;
      balance.idleSurplus -= count;
      assertBalance(balance);
      released[balance.assetId] = { count, draftAnimalHeads };
    }
    return released;
  }

  /**
   * Hands free vehicles from one market's fleet to another's, as a carrier sold his cart and team
   * where the load was delivered (§10.13). Returns how many moved.
   */
  transferLandAssets(
    fromMarketId: number,
    toMarketId: number,
    assetId: MerchantLandAssetBalance["assetId"],
    quantity: number
  ): number {
    const from = findLedger(fromMarketId)?.landAssets.find(asset => asset.assetId === assetId);
    const to = this.ensureLedger(toMarketId)?.landAssets.find(asset => asset.assetId === assetId);
    const count = Math.min(Math.floor(quantity), from?.available ?? 0);
    if (!from || !to || !(count > 0)) return 0;
    const heads = takeDraftAnimalHeads(from, count);
    if (heads > 0) to.draftAnimalHeads = (to.draftAnimalHeads ?? 0) + heads;
    from.available -= count;
    to.available += count;
    assertBalance(from);
    assertBalance(to);
    return count;
  }

  /** Credits completed land assets directly to the durable ledger, bypassing saleable market stock. */
  addAvailableLandAssets(
    marketId: number,
    assetId: MerchantLandAssetBalance["assetId"],
    quantity: number,
    draftAnimalHeads = 0
  ): void {
    if (!(quantity > 0)) return;
    const ledger = this.ensureLedger(marketId);
    const balance = ledger?.landAssets.find(asset => asset.assetId === assetId);
    if (!balance) return;
    balance.available += quantity;
    if (draftAnimalHeads > 0) balance.draftAnimalHeads = (balance.draftAnimalHeads ?? 0) + draftAnimalHeads;
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
   * waited for one or is loading at the landing for one, plus — while craft are one-way — about a
   * cycle's usual departures built ahead where the river trade is steady. Resets the cycle's
   * shortfall and departure counts.
   */
  takeRiverBargeTarget(marketId: number): number {
    const ledger = findLedger(marketId);
    if (!ledger) return 0;
    const departures = ledger.riverDeparturesThisCycle ?? 0;
    const smoothed =
      (ledger.riverDeparturesPerCycle ?? 0) * (1 - RIVER_DEPARTURE_SMOOTHING) + departures * RIVER_DEPARTURE_SMOOTHING;
    ledger.riverDeparturesPerCycle = smoothed > 0.01 ? smoothed : undefined;
    ledger.riverDeparturesThisCycle = undefined;
    // Barges for the shipments loading at the landing.
    let loading = 0;
    for (const caravan of getCaravans()) {
      if (caravan.state !== "loading" || caravan.transportReservationId !== undefined) continue;
      if (!stageSegments(caravan).some(segment => segment.type === "river")) continue;
      if ((caravan.transportDispatcherMarketId ?? this.getDispatcherMarketId(caravan)) !== marketId) continue;
      // Each shipment sails in its own barge, however little it fills.
      const slots = caravan.payload.reduce((sum, item) => sum + item.units * (item.cargoSlotsPerUnit ?? 1), 0);
      loading += Math.max(1, Math.ceil(slots / RIVER_BARGE_CARGO_CAPACITY_SLOTS - 0.000001));
    }
    const shortfall =
      Math.ceil((ledger.riverShortfallSlots ?? 0) / RIVER_BARGE_CARGO_CAPACITY_SLOTS - 0.000001) + loading;
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
