/**
 * Undirected burg-pair trade ledger (docs/plan/fmg-economy-to-city-editor.md §6).
 *
 * Route.traffic counts land departures only. This ledger keeps the pair, the cargo, and
 * whether the trip went by land, river, or sea, with the same 0.7 yearly retention.
 */

import type { SiteTradePartner } from "../../../services/burgSiteEconomy";
import type { Route } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getEscortJobPostings,
  getGoods,
  getMarkets,
  getTradeCorridors,
  getWorldContext,
  isEconomyContextReady,
  setTradeCorridors
} from "../economyContext";
import type { Caravan, TradeRouteSegment } from "./marketTypes";
import type { MarketShipment } from "./retailInventoryTypes";
import { getGoodCargoSlotsPerUnit } from "./tradeCargo";
import { calculateRouteDurationDays } from "./tradeRouteDuration";

/** Same holdover as Route.traffic (`ROUTE_TRAFFIC_ANNUAL_RETENTION`). */
export const CORRIDOR_ANNUAL_RETENTION = 0.7;

/** Weight of a new journey in the running travel-time and threat averages. */
export const CORRIDOR_OBSERVATION_WEIGHT = 0.3;

/** Stocks below this after decay are dropped. */
export const CORRIDOR_MIN_STOCK = 0.05;

/** Sea share at which a pair is treated as short of harbour works. */
export const HARBOR_SHORT_SEA_SHARE = 0.5;

/** Harbour works below this still count as short. */
export const HARBOR_SHORT_LEVEL = 0.4;

const PARTNER_LIMIT = 8;
const GOODS_KEPT = 8;
const NEED_LIMIT = 40;

export interface TradeCorridor {
  /** Smaller burg id first. The pair is undirected. */
  burgA: number;
  burgB: number;
  /** Departure count, decayed yearly by `CORRIDOR_ANNUAL_RETENTION`. */
  departures: number;
  /** Cargo slots, decayed the same way. */
  cargoSlots: number;
  value: number;
  /** Cargo-slot split. The three numbers add up to `cargoSlots`. */
  byMode: { land: number; river: number; sea: number };
  /** EWMA of the journey actually planned, in days. */
  meanTravelDays: number;
  /** Latest journey timed as if every land leg were a paved road. */
  idealTravelDays: number;
  /** 0..1, from escort postings on this pair. */
  threat: number;
  /** Land route ids, busiest first. */
  routeIds: number[];
  /** How often those routes used a ferry instead of a bridge. */
  ferryCrossings: number;
  /** Departures per land route. Kept so the order survives a reload. */
  routeHits: Record<string, number>;
  /** Cargo slots per good id. */
  goodsSlots: Record<string, number>;
}

export interface CorridorMovement {
  originBurgId: number;
  destinationBurgId: number;
  cargoSlots: number;
  value: number;
  /** Shares of path length. They should add up to 1. */
  modeShare: { land: number; river: number; sea: number };
  observedDays: number;
  idealDays: number;
  routeIds: number[];
  ferryCrossings: number;
  /** 0..1. Omitted when this journey has no escort posting. */
  threat?: number;
  goods?: { id: number; slots: number }[];
}

export interface TradeCorridorNeed {
  burgA: number;
  burgB: number;
  nameA: string;
  nameB: string;
  cargoSlots: number;
  /** 0..1 rank of cargo among corridors that carry any. */
  demand: number;
  /** meanTravelDays / idealTravelDays. 1 when the ideal is unknown. */
  delay: number;
  threat: number;
  /** ferryCrossings / departures. */
  ferryShare: number;
  harborShort: boolean;
  mode: SiteTradePartner["mode"];
}

function emptyCorridor(burgA: number, burgB: number): TradeCorridor {
  return {
    burgA,
    burgB,
    departures: 0,
    cargoSlots: 0,
    value: 0,
    byMode: { land: 0, river: 0, sea: 0 },
    meanTravelDays: 0,
    idealTravelDays: 0,
    threat: 0,
    routeIds: [],
    ferryCrossings: 0,
    routeHits: {},
    goodsSlots: {}
  };
}

function pairOf(origin: number, destination: number): [number, number] | null {
  if (!Number.isInteger(origin) || !Number.isInteger(destination) || origin <= 0 || destination <= 0) return null;
  if (origin === destination) return null;
  return origin < destination ? [origin, destination] : [destination, origin];
}

function blend(previous: number, sample: number, hasHistory: boolean): number {
  if (!Number.isFinite(sample)) return previous;
  if (!hasHistory) return sample;
  return previous * (1 - CORRIDOR_OBSERVATION_WEIGHT) + sample * CORRIDOR_OBSERVATION_WEIGHT;
}

function trimRecord(record: Record<string, number>, limit: number): Record<string, number> {
  const entries = Object.entries(record)
    .filter(([, amount]) => amount >= CORRIDOR_MIN_STOCK)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  return Object.fromEntries(entries);
}

function orderedRouteIds(hits: Record<string, number>): number[] {
  return Object.entries(hits)
    .filter(([, hitsOnRoute]) => hitsOnRoute >= CORRIDOR_MIN_STOCK)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => Number(id))
    .filter(id => Number.isInteger(id));
}

function dominantMode(byMode: TradeCorridor["byMode"]): SiteTradePartner["mode"] {
  if (byMode.sea >= byMode.land && byMode.sea >= byMode.river && byMode.sea > 0) return "sea";
  if (byMode.river >= byMode.land && byMode.river > 0) return "river";
  return "land";
}

export function delayRatio(corridor: Pick<TradeCorridor, "meanTravelDays" | "idealTravelDays">): number {
  if (!(corridor.idealTravelDays > 0) || !Number.isFinite(corridor.meanTravelDays)) return 1;
  return corridor.meanTravelDays / corridor.idealTravelDays;
}

function demandOf(corridors: readonly TradeCorridor[]): Map<string, number> {
  const carrying = corridors.filter(corridor => corridor.cargoSlots > 0);
  const ranks = new Map<string, number>();
  if (!carrying.length) return ranks;
  for (const corridor of carrying) {
    const atMost = carrying.filter(other => other.cargoSlots <= corridor.cargoSlots).length;
    ranks.set(`${corridor.burgA}:${corridor.burgB}`, Math.round((atMost / carrying.length) * 10000) / 10000);
  }
  return ranks;
}

/** Fold one journey into a ledger. The input array is not mutated. */
export function applyCorridorMovement(
  corridors: readonly TradeCorridor[],
  movement: CorridorMovement
): TradeCorridor[] {
  const pair = pairOf(movement.originBurgId, movement.destinationBurgId);
  if (!pair) return corridors.slice();
  const [burgA, burgB] = pair;
  const next = corridors.map(corridor => ({
    ...corridor,
    byMode: { ...corridor.byMode },
    routeHits: { ...corridor.routeHits },
    goodsSlots: { ...corridor.goodsSlots },
    routeIds: corridor.routeIds.slice()
  }));
  let corridor = next.find(entry => entry.burgA === burgA && entry.burgB === burgB);
  if (!corridor) {
    corridor = emptyCorridor(burgA, burgB);
    next.push(corridor);
  }
  const hadHistory = corridor.departures > 0;
  const slots = Math.max(0, movement.cargoSlots);
  const share = movement.modeShare;
  const shareTotal = Math.max(0, share.land) + Math.max(0, share.river) + Math.max(0, share.sea);
  const land = shareTotal > 0 ? Math.max(0, share.land) / shareTotal : 1;
  const river = shareTotal > 0 ? Math.max(0, share.river) / shareTotal : 0;
  const sea = shareTotal > 0 ? Math.max(0, share.sea) / shareTotal : 0;

  corridor.departures = rn(corridor.departures + 1, 3);
  corridor.cargoSlots = rn(corridor.cargoSlots + slots, 3);
  corridor.value = rn(corridor.value + Math.max(0, movement.value), 3);
  corridor.byMode.land = rn(corridor.byMode.land + slots * land, 3);
  corridor.byMode.river = rn(corridor.byMode.river + slots * river, 3);
  corridor.byMode.sea = rn(corridor.byMode.sea + slots * sea, 3);
  corridor.ferryCrossings = rn(corridor.ferryCrossings + Math.max(0, movement.ferryCrossings), 3);
  if (movement.observedDays > 0 && Number.isFinite(movement.observedDays)) {
    corridor.meanTravelDays = rn(blend(corridor.meanTravelDays, movement.observedDays, hadHistory), 3);
  }
  if (movement.idealDays > 0 && Number.isFinite(movement.idealDays)) {
    corridor.idealTravelDays = rn(movement.idealDays, 3);
  }
  if (movement.threat !== undefined && Number.isFinite(movement.threat)) {
    const sample = Math.max(0, Math.min(1, movement.threat));
    corridor.threat = rn(blend(corridor.threat, sample, hadHistory && corridor.threat > 0), 3);
  }
  for (const routeId of movement.routeIds) {
    if (!Number.isInteger(routeId)) continue;
    const key = String(routeId);
    corridor.routeHits[key] = (corridor.routeHits[key] ?? 0) + 1;
  }
  corridor.routeIds = orderedRouteIds(corridor.routeHits);
  for (const good of movement.goods ?? []) {
    if (!Number.isInteger(good.id) || !(good.slots > 0)) continue;
    const key = String(good.id);
    corridor.goodsSlots[key] = rn((corridor.goodsSlots[key] ?? 0) + good.slots, 3);
  }
  corridor.goodsSlots = trimRecord(corridor.goodsSlots, GOODS_KEPT);
  return next;
}

/** Yearly decay. Drops pairs that no longer carry measurable cargo or departures. */
export function decayCorridors(
  corridors: readonly TradeCorridor[],
  retention = CORRIDOR_ANNUAL_RETENTION
): TradeCorridor[] {
  const kept: TradeCorridor[] = [];
  for (const corridor of corridors) {
    const departures = rn(corridor.departures * retention, 3);
    const cargoSlots = rn(corridor.cargoSlots * retention, 3);
    if (departures < CORRIDOR_MIN_STOCK && cargoSlots < CORRIDOR_MIN_STOCK) continue;
    const routeHits: Record<string, number> = {};
    for (const [id, hits] of Object.entries(corridor.routeHits)) {
      const nextHits = rn(hits * retention, 3);
      if (nextHits >= CORRIDOR_MIN_STOCK) routeHits[id] = nextHits;
    }
    const goodsSlots: Record<string, number> = {};
    for (const [id, slots] of Object.entries(corridor.goodsSlots)) {
      const nextSlots = rn(slots * retention, 3);
      if (nextSlots >= CORRIDOR_MIN_STOCK) goodsSlots[id] = nextSlots;
    }
    kept.push({
      ...corridor,
      departures,
      cargoSlots,
      value: rn(corridor.value * retention, 3),
      byMode: {
        land: rn(corridor.byMode.land * retention, 3),
        river: rn(corridor.byMode.river * retention, 3),
        sea: rn(corridor.byMode.sea * retention, 3)
      },
      ferryCrossings: rn(corridor.ferryCrossings * retention, 3),
      routeHits,
      routeIds: orderedRouteIds(routeHits),
      goodsSlots: trimRecord(goodsSlots, GOODS_KEPT)
    });
  }
  return kept;
}

/** Paving priority per land route: cargo rank times how late the corridor runs. */
export function corridorRouteScores(corridors: readonly TradeCorridor[]): Map<number, number> {
  const demand = demandOf(corridors);
  const scores = new Map<number, number>();
  for (const corridor of corridors) {
    const score = (demand.get(`${corridor.burgA}:${corridor.burgB}`) ?? 0) * delayRatio(corridor);
    for (const routeId of corridor.routeIds) {
      scores.set(routeId, Math.max(scores.get(routeId) ?? 0, score));
    }
  }
  return scores;
}

export function listCorridorNeeds(
  corridors: readonly TradeCorridor[],
  lookup: {
    name: (burgId: number) => string;
    harbor: (burgId: number) => number;
  },
  limit = NEED_LIMIT
): TradeCorridorNeed[] {
  const demand = demandOf(corridors);
  return corridors
    .filter(corridor => corridor.departures > 0 || corridor.cargoSlots > 0)
    .map(corridor => {
      const seaShare = corridor.cargoSlots > 0 ? corridor.byMode.sea / corridor.cargoSlots : 0;
      const harborA = lookup.harbor(corridor.burgA);
      const harborB = lookup.harbor(corridor.burgB);
      return {
        burgA: corridor.burgA,
        burgB: corridor.burgB,
        nameA: lookup.name(corridor.burgA) || String(corridor.burgA),
        nameB: lookup.name(corridor.burgB) || String(corridor.burgB),
        cargoSlots: corridor.cargoSlots,
        demand: demand.get(`${corridor.burgA}:${corridor.burgB}`) ?? 0,
        delay: rn(delayRatio(corridor), 3),
        threat: corridor.threat,
        ferryShare: corridor.departures > 0 ? rn(corridor.ferryCrossings / corridor.departures, 3) : 0,
        harborShort:
          seaShare >= HARBOR_SHORT_SEA_SHARE && (harborA < HARBOR_SHORT_LEVEL || harborB < HARBOR_SHORT_LEVEL),
        mode: dominantMode(corridor.byMode)
      };
    })
    .sort((a, b) => b.cargoSlots - a.cargoSlots || b.demand - a.demand)
    .slice(0, limit);
}

/** Top partners of one burg. `annualSlots` is the decayed cargo stock, so partners compare with each other. */
export function tradePartnersForBurg(
  burgId: number,
  corridors: readonly TradeCorridor[],
  lookup: { name: (burgId: number) => string; goodName: (goodId: number) => string }
): SiteTradePartner[] {
  return corridors
    .filter(corridor => corridor.burgA === burgId || corridor.burgB === burgId)
    .map(corridor => {
      const other = corridor.burgA === burgId ? corridor.burgB : corridor.burgA;
      const goods = Object.entries(corridor.goodsSlots)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => lookup.goodName(Number(id)))
        .filter(name => name.length > 0);
      return {
        burgId: other,
        name: lookup.name(other) || String(other),
        annualSlots: corridor.cargoSlots,
        mode: dominantMode(corridor.byMode),
        routeId: corridor.routeIds[0] ?? null,
        mainGoods: goods
      };
    })
    .sort((a, b) => b.annualSlots - a.annualSlots)
    .slice(0, PARTNER_LIMIT);
}

function segmentLength(segment: TradeRouteSegment): number {
  let length = 0;
  for (let index = 1; index < segment.points.length; index++) {
    const from = segment.points[index - 1];
    const to = segment.points[index];
    length += Math.hypot(to[0] - from[0], to[1] - from[1]);
  }
  return length;
}

export function modeShareOf(segments: readonly TradeRouteSegment[]): CorridorMovement["modeShare"] {
  const length = { land: 0, river: 0, sea: 0 };
  for (const segment of segments) {
    const span = segmentLength(segment);
    if (segment.type === "land") length.land += span;
    else if (segment.type === "river") length.river += span;
    else length.sea += span;
  }
  const total = length.land + length.river + length.sea;
  if (!(total > 0)) return { land: 1, river: 0, sea: 0 };
  return { land: length.land / total, river: length.river / total, sea: length.sea / total };
}

function landRouteIds(segments: readonly TradeRouteSegment[]): number[] {
  const ids = new Set<number>();
  const cellRoutes = getWorldContext().pack.cells?.routes;
  if (!cellRoutes) return [];
  for (const segment of segments) {
    if (segment.type !== "land") continue;
    for (let index = 0; index < segment.points.length - 1; index++) {
      const from = segment.points[index][2];
      const to = segment.points[index + 1][2];
      if (from === undefined || to === undefined || from === to) continue;
      const routeId = cellRoutes[from]?.[to];
      if (routeId !== undefined) ids.add(routeId);
    }
  }
  return [...ids];
}

function findRoute(routeId: number): Route | undefined {
  const routes = getWorldContext().pack.routes;
  if (!routes) return undefined;
  const direct = routes[routeId];
  if (direct?.i === routeId) return direct;
  return routes.find(route => route.i === routeId);
}

function ferryCrossingsOn(routeIds: readonly number[]): number {
  let crossings = 0;
  for (const routeId of routeIds) {
    const route = findRoute(routeId);
    for (const crossing of route?.riverCrossings ?? []) {
      if (crossing.plan?.kind === "ferry") crossings++;
    }
  }
  return crossings;
}

function escortThreat(origin: number, destination: number): number | undefined {
  let found = false;
  let max = 0;
  for (const posting of getEscortJobPostings()) {
    if (posting.kind !== "trade") continue;
    const matches =
      (posting.burgId === origin && posting.destinationBurgId === destination) ||
      (posting.burgId === destination && posting.destinationBurgId === origin);
    if (!matches) continue;
    found = true;
    max = Math.max(max, posting.threat?.threatScore ?? 0);
  }
  return found ? Math.min(1, max / 1.5) : undefined;
}

function journeyDays(
  segments: readonly TradeRouteSegment[],
  baked: number | null
): { observed: number; ideal: number } {
  const distanceScale = getWorldContext().distanceScale;
  const scale = typeof distanceScale === "number" && distanceScale > 0 ? distanceScale : 1;
  let observed = baked ?? Number.NaN;
  let ideal = Number.NaN;
  try {
    if (!(observed > 0)) observed = calculateRouteDurationDays(segments, scale);
    ideal = calculateRouteDurationDays(
      segments.map(segment => (segment.type === "land" ? { ...segment, pavedShare: 1 } : segment)),
      scale
    );
  } catch {
    /* Movement settings are absent in some tests. The pair is still recorded. */
  }
  return {
    observed: Number.isFinite(observed) ? observed : 0,
    ideal: Number.isFinite(ideal) ? ideal : 0
  };
}

function bakedTravelDays(caravan: Caravan): number | null {
  const legs = caravan.travelLegs;
  if (!legs?.length) return null;
  let previous = 0;
  let days = 0;
  for (const leg of legs) {
    const kilometres = leg.endKm - previous;
    if (leg.speedKmPerDay > 0) days += kilometres / leg.speedKmPerDay;
    previous = leg.endKm;
  }
  return days > 0 ? Math.ceil(days) : null;
}

function remember(movement: CorridorMovement): void {
  if (!isEconomyContextReady()) return;
  setTradeCorridors(applyCorridorMovement(getTradeCorridors(), movement));
}

function goodById(goodId: number) {
  return getGoods().find(good => good.i === goodId);
}

/** One commercial or state caravan leaving its origin. */
export function recordCaravanCorridor(caravan: Caravan): void {
  if (!isEconomyContextReady()) return;
  const origin = endpointBurg(caravan.sellerType, caravan.seller);
  const destination = endpointBurg(caravan.buyerType, caravan.buyer);
  if (origin === null || destination === null) return;
  const goods = getGoods();
  const lines: { id: number; slots: number }[] = [];
  let slots = 0;
  for (const line of caravan.payload ?? []) {
    const perUnit = line.cargoSlotsPerUnit ?? slotsPerUnit(goods.find(good => good.i === line.goodId));
    const lineSlots = Math.max(0, line.units) * perUnit;
    slots += lineSlots;
    if (lineSlots > 0) lines.push({ id: line.goodId, slots: lineSlots });
  }
  const routeIds = landRouteIds(caravan.routeSegments ?? []);
  const days = journeyDays(caravan.routeSegments ?? [], bakedTravelDays(caravan));
  remember({
    originBurgId: origin,
    destinationBurgId: destination,
    cargoSlots: slots,
    value: Math.max(0, caravan.value ?? 0),
    modeShare: modeShareOf(caravan.routeSegments ?? []),
    observedDays: days.observed,
    idealDays: days.ideal,
    routeIds,
    ferryCrossings: ferryCrossingsOn(routeIds),
    threat: escortThreat(origin, destination),
    goods: lines
  });
}

function slotsPerUnit(good: ReturnType<typeof goodById>): number {
  if (!good) return 1;
  return getGoodCargoSlotsPerUnit(good);
}

function endpointBurg(kind: Caravan["sellerType"], id: number): number | null {
  if (kind === "burg") return id;
  return getMarkets().find(market => market.i === id)?.centerBurgId ?? null;
}

/** A same-market burg-to-burg shipment, counted when it arrives. */
export function recordMarketShipment(shipment: MarketShipment): void {
  if (!isEconomyContextReady()) return;
  const good = goodById(shipment.goodId);
  const slots = Math.max(0, shipment.units) * (good ? getGoodCargoSlotsPerUnit(good) : 1);
  const days = shipment.travelDays > 0 ? shipment.travelDays : 0;
  remember({
    originBurgId: shipment.originBurgId,
    destinationBurgId: shipment.destinationBurgId,
    cargoSlots: slots,
    value: 0,
    modeShare: { land: 1, river: 0, sea: 0 },
    observedDays: days,
    idealDays: days,
    routeIds: [],
    ferryCrossings: 0,
    threat: escortThreat(shipment.originBurgId, shipment.destinationBurgId),
    goods: slots > 0 ? [{ id: shipment.goodId, slots }] : []
  });
}

export function decayTradeCorridors(): void {
  if (!isEconomyContextReady()) return;
  const current = getTradeCorridors();
  if (!current.length) return;
  setTradeCorridors(decayCorridors(current));
}

export function liveCorridorNeeds(): TradeCorridorNeed[] {
  if (!isEconomyContextReady()) return [];
  const burgs = getWorldContext().pack.burgs ?? [];
  const name = (burgId: number) => burgs.find(burg => burg?.i === burgId)?.name ?? "";
  const harbor = (burgId: number) => burgs.find(burg => burg?.i === burgId)?.publicWorks?.harbor ?? 0;
  return listCorridorNeeds(getTradeCorridors(), { name, harbor });
}
