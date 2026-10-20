/**
 * Port warehouses and the sea-cargo queue (docs/plan/port-freight-queue-and-warehouses.md §4–§5).
 *
 * A port's warehouses are counted in cargo slots. They grow where sea trade and cargo waiting for
 * a ship outrun them, a building step at a time, and they stay when trade falls: London's legal
 * quays ran short of room for two centuries before the enclosed docks were dug, and Bergen's wharf
 * grew 140 m into the bay as the Hanse trade grew. City Editor draws them behind the quay.
 */

import { isTechnologyAtLeast } from "../../../generators/technologyProgress";
import type { PortWarehouseLayout, SitePortWarehouse } from "../../../services/burgSiteEconomy";
import { pow } from "../../../simulation/deterministicMath";
import { simEvents } from "../../../simulation/events";
import {
  getCaravans,
  getMarkets,
  getMerchantOrganizations,
  getPortWarehouses,
  getSimulationYear,
  getWorldContext,
  setPortWarehouses
} from "../economyContext";
import type { Caravan, PortWarehouseState, TradeRouteSegment } from "./marketTypes";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import { isInlandStage, seaArrivalPortBurgId, seaDepartureMarketId, seaDeparturePortBurgId } from "./seaRoutePorts";

/**
 * Warehouse rent per cargo slot and day in port (§4.4, §10.20). Rent was charged by room, not by
 * value: on the catalogue's median good (2 a slot) it comes to about 0.75% of the value a month,
 * the order of quay warehouse rents; a season's wait costs silk (8 a slot) half a percent and grain
 * (0.25 a slot) a sixth of its value, which is why grain waited in the country granaries rather
 * than on the quay.
 */
export const PORT_STORAGE_FEE = 0.0005;
/** Days the average sea cargo lies in a port warehouse, loading and unloading. */
const DWELL_DAYS = 30;
/** Monthly weight of the latest need in the smoothed need. */
const NEED_SMOOTHING = 0.1;
/** Months the need must exceed the capacity before a new building is started. */
const OVER_NEED_MONTHS_TO_BUILD = 12;
/** Days one building step takes. */
const BUILD_DAYS = 365;
/** Smallest building step (slots). */
const MIN_BUILD_STEP_SLOTS = 100;
/** Months without sea cargo before unused warehouses begin to turn to other uses. */
const IDLE_MONTHS_BEFORE_DECAY = 1200;
/** Yearly share of unused capacity lost after that. */
const IDLE_DECAY_PER_YEAR = 0.01;
/** Slots a port held before the simulation began, per population point (×2 at a market center). */
const INITIAL_SLOTS_PER_POPULATION_POINT = 40;

/** Floor area per cargo slot, as the stock-based warehouse yard (fmg-economy-to-city-editor.md §5.3). */
export const PORT_WAREHOUSE_FLOOR_M2_PER_SLOT = 0.8;
/**
 * Smallest floor area for each layout (§5.3–§5.4). A quay row starts with one small building; a
 * merchants' compound is the size of the Steelyard or the Fondaco; a state store the size of a
 * horreum or a rice store; dock warehouses the size of one West India Docks block and more.
 */
const LAYOUT_MIN_FLOOR_M2 = { quayRow: 250, compound: 3000, stateStore: 8000, dock: 12000 } as const;

const MONTH_DECAY = 11 / 12;

let portByMarket: Map<number, number> | null = null;
/** The pack the port lookup was built for; a loaded or new map rebuilds it. */
let portByMarketPack: unknown = null;

function buildPortByMarket(): Map<number, number> {
  const best = new Map<number, { burgId: number; population: number }>();
  for (const burg of getWorldContext().pack.burgs ?? []) {
    if (!burg?.i || burg.removed || !burg.port || typeof burg.market !== "number") continue;
    const population = burg.population ?? 0;
    const current = best.get(burg.market);
    if (!current || population > current.population || (population === current.population && burg.i < current.burgId))
      best.set(burg.market, { burgId: burg.i, population });
  }
  return new Map([...best].map(([marketId, entry]) => [marketId, entry.burgId]));
}

/** The market's largest port burg: where its sea cargo waits and its ordered hulls are based. */
export function getMarketPortBurgId(marketId: number): number | undefined {
  const pack = getWorldContext().pack;
  if (!portByMarket || portByMarketPack !== pack) {
    portByMarket = buildPortByMarket();
    portByMarketPack = pack;
  }
  return portByMarket.get(marketId);
}

function isSeaSegment(segment: TradeRouteSegment): boolean {
  return segment.type === "sea" || segment.type === "water";
}

function payloadSlots(caravan: Pick<Caravan, "payload">): number {
  return caravan.payload.reduce((sum, item) => sum + item.units * (item.cargoSlotsPerUnit ?? 1), 0);
}

function buyerMarketId(caravan: Pick<Caravan, "buyer" | "buyerType">): number | undefined {
  if (caravan.buyerType === "market") return caravan.buyer;
  const marketId = getWorldContext().pack.burgs?.[caravan.buyer]?.market;
  return typeof marketId === "number" ? marketId : undefined;
}

function ensureState(burgId: number, states: PortWarehouseState[]): PortWarehouseState {
  let state = states.find(entry => entry.burgId === burgId);
  if (state) return state;
  const burg = getWorldContext().pack.burgs?.[burgId];
  const marketCenter = getMarkets().some(market => market.centerBurgId === burgId);
  state = {
    burgId,
    capacitySlots: Math.round((burg?.population ?? 0) * INITIAL_SLOTS_PER_POPULATION_POINT * (marketCenter ? 2 : 1)),
    needSlots: 0,
    annualSlots: 0,
    cycleSlots: 0,
    queuePeakSlots: 0,
    queuedSlots: 0,
    overNeedMonths: 0,
    idleMonths: 0,
    lastBuiltYear: null
  };
  states.push(state);
  return state;
}

/**
 * A departing sea shipment passes through the warehouses of both its ports: where its sea leg
 * leaves and arrives, which for a market without a port is another market's port (§10.7).
 */
export function recordSeaDeparture(caravan: Caravan, dispatcherMarketId: number | null): void {
  if (!caravan.routeSegments.some(isSeaSegment)) return;
  const slots = payloadSlots(caravan);
  if (!(slots > 0)) return;
  const states = getPortWarehouses();
  const ports = new Set<number>();
  const buyer = buyerMarketId(caravan);
  const from =
    seaDeparturePortBurgId(caravan.routeSegments) ??
    (typeof dispatcherMarketId === "number" ? getMarketPortBurgId(dispatcherMarketId) : undefined);
  const to =
    seaArrivalPortBurgId(caravan.routeSegments) ?? (typeof buyer === "number" ? getMarketPortBurgId(buyer) : undefined);
  for (const port of [from, to]) if (port !== undefined) ports.add(port);
  if (!ports.size) return;
  for (const port of ports) ensureState(port, states).cycleSlots += slots;
  if (from !== undefined) {
    const state = ensureState(from, states);
    state.cycleOutboundSlots = (state.cycleOutboundSlots ?? 0) + slots;
  }
  setPortWarehouses(states);
}

/**
 * Sea cargo loaded and waiting for a ship, on its way to the port by land or river, and sea cargo
 * no hull could be booked for, by the market whose port it sails from: a market without a port
 * waits at another market's (§10.7, §10.19).
 */
export function collectSeaBacklogSlots(): Map<number, number> {
  const backlog = new Map<number, number>();
  for (const caravan of getCaravans()) {
    const bound = caravan.state === "loading" || (caravan.state === "transit" && isInlandStage(caravan));
    if (!bound || !caravan.routeSegments.some(isSeaSegment)) continue;
    const marketId =
      seaDepartureMarketId(caravan.routeSegments) ??
      caravan.transportDispatcherMarketId ??
      MerchantTransportAssets.getDispatcherMarketId(caravan);
    if (marketId === null || marketId === undefined) continue;
    backlog.set(marketId, (backlog.get(marketId) ?? 0) + payloadSlots(caravan));
  }
  for (const [marketId, shortfall] of MerchantTransportAssets.peekSeaShortfallByPortMarket())
    if (shortfall > 0) backlog.set(marketId, (backlog.get(marketId) ?? 0) + shortfall);
  return backlog;
}

/**
 * The port burg a loading shipment's cargo lies at waiting for a ship: where its sea leg leaves.
 * Undefined for cargo still at an inland origin or not bound for the sea (§10.19).
 */
export function waitingPortBurgId(caravan: Caravan): number | undefined {
  if (caravan.state !== "loading" || isInlandStage(caravan) || !caravan.routeSegments.some(isSeaSegment))
    return undefined;
  if (caravan.portTransfer?.atPort) return caravan.portTransfer.portBurgId;
  const dispatcher = caravan.transportDispatcherMarketId ?? MerchantTransportAssets.getDispatcherMarketId(caravan);
  return (
    seaDeparturePortBurgId(caravan.routeSegments) ?? (dispatcher === null ? undefined : getMarketPortBurgId(dispatcher))
  );
}

/**
 * Every day: cargo waiting in port for a ship runs up warehouse rent, by the slot and the day, and
 * at double the rate for what the port's warehouses cannot hold (stacked on the quay or left in the
 * lighters). The house pays it when the cargo sails or is sold (§4.4, §10.20).
 */
export function accruePortStorage(deltaDays: number): void {
  if (!(deltaDays > 0)) return;
  const waiting = new Map<number, { slots: number; caravans: Caravan[] }>();
  for (const caravan of getCaravans()) {
    const burgId = waitingPortBurgId(caravan);
    if (burgId === undefined || caravan.sellerType !== "market") continue;
    const entry = waiting.get(burgId) ?? { slots: 0, caravans: [] };
    entry.slots += payloadSlots(caravan);
    entry.caravans.push(caravan);
    waiting.set(burgId, entry);
  }
  const states = getPortWarehouses();
  for (const [burgId, entry] of waiting) {
    if (!(entry.slots > 0)) continue;
    const capacity = states.find(state => state.burgId === burgId)?.capacitySlots ?? 0;
    const rate = PORT_STORAGE_FEE * (1 + Math.max(0, entry.slots - capacity) / entry.slots);
    for (const caravan of entry.caravans) {
      if (!caravan.loading) continue;
      caravan.loading.portStorageDue = (caravan.loading.portStorageDue ?? 0) + payloadSlots(caravan) * rate * deltaDays;
    }
  }
}

/**
 * Sea cargo waiting for a ship, by the port burg it waits at: where its sea leg leaves, as the
 * departures through the port are counted. Cargo with no known port waits at its market's. Cargo
 * still at an inland origin, or on the road to the port, is not in the port warehouse (§10.19).
 */
function collectSeaQueueByPortBurg(): Map<number, number> {
  const queued = new Map<number, number>();
  const add = (burgId: number | undefined, slots: number) => {
    if (burgId !== undefined && slots > 0) queued.set(burgId, (queued.get(burgId) ?? 0) + slots);
  };
  for (const caravan of getCaravans()) add(waitingPortBurgId(caravan), payloadSlots(caravan));
  for (const entry of MerchantTransportAssets.peekSeaShortfallEntries())
    add(entry.portBurgId ?? getMarketPortBurgId(entry.marketId), entry.slots);
  return queued;
}

/**
 * Sea cargo each market's ports are to load, by market: what waits for a ship, or a month of the
 * usual departures where that is more. A master sailed for the port whose harvest or season's
 * trade he knew would fill his hold, not only where cargo already lay on the quay (§10.10).
 */
export function collectSeaDemandSlots(): Map<number, number> {
  const demand = collectSeaBacklogSlots();
  const burgs = getWorldContext().pack.burgs ?? [];
  const expected = new Map<number, number>();
  for (const state of getPortWarehouses()) {
    const marketId = burgs[state.burgId]?.market;
    const monthly = (state.annualOutboundSlots ?? 0) / 12;
    if (typeof marketId === "number" && monthly > 0) expected.set(marketId, (expected.get(marketId) ?? 0) + monthly);
  }
  for (const [marketId, slots] of expected) demand.set(marketId, Math.max(demand.get(marketId) ?? 0, slots));
  return demand;
}

/**
 * Every day: idle hulls set out in ballast for the ports where sea cargo waits or is expected, or go
 * home to lie up (§4.5, §10.8, §10.10).
 */
export function repositionIdleHulls(): void {
  if (!MerchantTransportAssets.isWaterAssetModeActive()) return;
  // A hull leaves in ballast now and berths at the waiting port when the passage is over.
  for (const move of MerchantTransportAssets.repositionIdleHulls(collectSeaDemandSlots(), getMarketPortBurgId)) {
    simEvents.dispatchEvent(
      new CustomEvent("fmg:economy-merchant-hull-ballast", { detail: { hullId: move.hullId, burgId: move.burgId } })
    );
  }
}

/**
 * Start of a production cycle: each port's need and warehouses are brought up to date. Runs before
 * hull orders read the sea shortfall.
 */
export function beginPortProductionCycle(cycleDays: number): void {
  portByMarket = buildPortByMarket();
  portByMarketPack = getWorldContext().pack;

  const states = getPortWarehouses();
  const year = getSimulationYear();
  const queuedByPort = collectSeaQueueByPortBurg();
  for (const port of new Set([...portByMarket.values(), ...queuedByPort.keys()])) ensureState(port, states);

  for (const state of states) {
    const queued = queuedByPort.get(state.burgId) ?? 0;
    state.annualSlots = state.annualSlots * MONTH_DECAY + state.cycleSlots;
    const outbound = (state.annualOutboundSlots ?? 0) * MONTH_DECAY + (state.cycleOutboundSlots ?? 0);
    state.annualOutboundSlots = outbound > 0.01 ? outbound : undefined;
    state.cycleOutboundSlots = undefined;
    state.idleMonths = state.cycleSlots > 0 ? 0 : state.idleMonths + 1;
    state.cycleSlots = 0;
    state.queuedSlots = queued;
    state.queuePeakSlots = Math.max(queued, state.queuePeakSlots * MONTH_DECAY);
    const need = (state.annualSlots * DWELL_DAYS) / 365 + state.queuePeakSlots;
    state.needSlots += (need - state.needSlots) * NEED_SMOOTHING;

    if (state.buildingSlots !== undefined) {
      state.buildingDaysLeft = (state.buildingDaysLeft ?? 0) - cycleDays;
      if (state.buildingDaysLeft <= 0) {
        state.capacitySlots += state.buildingSlots;
        state.lastBuiltYear = year;
        state.buildingSlots = undefined;
        state.buildingDaysLeft = undefined;
      }
    } else if (state.needSlots > state.capacitySlots) {
      state.overNeedMonths += 1;
      if (state.overNeedMonths >= OVER_NEED_MONTHS_TO_BUILD) {
        state.buildingSlots = Math.max(MIN_BUILD_STEP_SLOTS, Math.round(state.needSlots - state.capacitySlots));
        state.buildingDaysLeft = BUILD_DAYS;
        state.overNeedMonths = 0;
      }
    } else state.overNeedMonths = 0;

    if (state.idleMonths > IDLE_MONTHS_BEFORE_DECAY)
      state.capacitySlots *= pow(1 - IDLE_DECAY_PER_YEAR, cycleDays / 365);
  }
  setPortWarehouses(states);
}

function percentile(value: number, values: readonly number[]): number {
  if (!(value > 0) || !values.length) return 0;
  return Math.round((values.filter(other => other <= value).length / values.length) * 10000) / 10000;
}

/** Which of the historical layouts (§2.4) a port of this size and standing builds. */
export function portWarehouseLayout(input: {
  floorAreaM2: number;
  steam: boolean;
  capital: boolean;
  merchantHome: boolean;
}): PortWarehouseLayout {
  const floor = input.floorAreaM2;
  if (input.steam && floor >= LAYOUT_MIN_FLOOR_M2.dock) return "dock";
  if (input.capital && floor >= LAYOUT_MIN_FLOOR_M2.stateStore) return "stateStore";
  if (input.merchantHome && floor >= LAYOUT_MIN_FLOOR_M2.compound) return "compound";
  if (floor >= LAYOUT_MIN_FLOOR_M2.quayRow) return "quayRow";
  return "merchantHouses";
}

/** City Editor profile of one port burg's warehouses. Undefined when the burg keeps none. */
export function portWarehouseForBurg(burgId: number, mainGoods: readonly string[]): SitePortWarehouse | undefined {
  const states = getPortWarehouses();
  const state = states.find(entry => entry.burgId === burgId);
  if (!state || !(state.capacitySlots > 0)) return undefined;
  const burg = getWorldContext().pack.burgs?.[burgId];
  const stateId = burg?.state ?? 0;
  const floorAreaM2 = Math.round(state.capacitySlots * PORT_WAREHOUSE_FLOOR_M2_PER_SLOT);
  return {
    capacitySlots: Math.round(state.capacitySlots),
    floorAreaM2,
    layout: portWarehouseLayout({
      floorAreaM2,
      steam: stateId > 0 && isTechnologyAtLeast("coastalSteamNavigation", stateId, "adopted"),
      capital: Boolean(burg?.capital),
      merchantHome: getMerchantOrganizations().some(organization => organization.homeBurgId === burgId)
    }),
    rank: percentile(
      state.capacitySlots,
      states.map(entry => entry.capacitySlots).filter(value => value > 0)
    ),
    queuedSlots: Math.round(state.queuedSlots),
    mainGoods: mainGoods.slice(0, 3)
  };
}

export function clearPortWarehouseCache(): void {
  portByMarket = null;
  portByMarketPack = null;
}
