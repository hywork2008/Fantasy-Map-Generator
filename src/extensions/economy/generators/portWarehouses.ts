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

/** A departing sea shipment passes through the warehouses of both its ports. */
export function recordSeaDeparture(caravan: Caravan, dispatcherMarketId: number | null): void {
  if (!caravan.routeSegments.some(isSeaSegment)) return;
  const slots = payloadSlots(caravan);
  if (!(slots > 0)) return;
  const states = getPortWarehouses();
  const ports = new Set<number>();
  for (const marketId of [dispatcherMarketId, buyerMarketId(caravan)]) {
    if (typeof marketId !== "number") continue;
    const port = getMarketPortBurgId(marketId);
    if (port !== undefined) ports.add(port);
  }
  if (!ports.size) return;
  for (const port of ports) ensureState(port, states).cycleSlots += slots;
  setPortWarehouses(states);
}

/** Sea cargo loaded and waiting for a ship, and sea cargo no hull could be booked for, by market. */
export function collectSeaBacklogSlots(): Map<number, number> {
  const backlog = new Map<number, number>();
  for (const caravan of getCaravans()) {
    if (caravan.state !== "loading" || !caravan.routeSegments.some(isSeaSegment)) continue;
    const marketId = caravan.transportDispatcherMarketId ?? MerchantTransportAssets.getDispatcherMarketId(caravan);
    if (marketId === null) continue;
    backlog.set(marketId, (backlog.get(marketId) ?? 0) + payloadSlots(caravan));
  }
  for (const market of getMarkets()) {
    const shortfall = MerchantTransportAssets.peekSeaHullShortfall(market.i);
    if (shortfall > 0) backlog.set(market.i, (backlog.get(market.i) ?? 0) + shortfall);
  }
  return backlog;
}

/**
 * Start of a production cycle: idle hulls sail to the ports where cargo waits, then each port's
 * need and warehouses are brought up to date. Runs before hull orders read the sea shortfall.
 */
export function beginPortProductionCycle(cycleDays: number): void {
  portByMarket = buildPortByMarket();
  portByMarketPack = getWorldContext().pack;
  const backlog = collectSeaBacklogSlots();

  for (const move of MerchantTransportAssets.repositionIdleHulls(backlog, getMarketPortBurgId)) {
    simEvents.dispatchEvent(
      new CustomEvent("fmg:economy-merchant-hull-reposition", { detail: { hullId: move.hullId, burgId: move.burgId } })
    );
  }

  const states = getPortWarehouses();
  const year = getSimulationYear();
  const queuedByPort = new Map<number, number>();
  for (const [marketId, slots] of backlog) {
    const port = getMarketPortBurgId(marketId);
    if (port !== undefined) queuedByPort.set(port, (queuedByPort.get(port) ?? 0) + slots);
  }
  for (const port of new Set(portByMarket.values())) ensureState(port, states);

  for (const state of states) {
    const queued = queuedByPort.get(state.burgId) ?? 0;
    state.annualSlots = state.annualSlots * MONTH_DECAY + state.cycleSlots;
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
