/**
 * How much cargo each market's fleet can still take on this production cycle
 * (docs/plan/long-distance-merchant-reach-capital.md §17). Trade matching used to book whatever
 * stock and budget allowed: one month a market booked 398 cartloads of grain for a fleet of 44
 * carts, and most of it waited past the stale limit and was cancelled. A merchant does not buy what
 * he cannot carry within the month.
 *
 * Capacity is counted in slot-days: a load of `s` slots on a trip of `d` days takes `s × d` of them
 * (vehicles are back at the home ledger on arrival). Cargo already booked, loading or on the road
 * holds its share. A vehicle of `c` slots offers `c × H` slot-days, where the horizon `H` is a month,
 * or one trip when the trip is longer: a house booking for a voyage of three months fills each ship
 * once, rather than a third of it because the ship cannot be back within the month
 * (long-distance-merchant-reach-capital.md §17.4, §18).
 *
 * Land room counts the carts the market may hire on top of its own. Sea room counts the hulls of
 * any owner lying at the port the route's sea leg leaves from — the market's own port, or for a
 * market without one, another market's — and the market's own hulls coming in
 * (docs/plan/port-freight-queue-and-warehouses.md §3, §4.2, §10.7). A hull serves the port she
 * lies in: one that sails with cargo ends her voyage at the far port, and is not back within the
 * month to sail again (§10.6). Sea room is therefore counted in slots, one voyage a hull, held only
 * by cargo still waiting to sail, and kept per exporter and departure port.
 * A separate own-land count tells the booking how much of a load rides on hired carts.
 */

import { getCaravans, getExportStagingLots, getGoods } from "../economyContext";
import { DEFAULT_DRAFT_ANIMAL_ID } from "./caravanMovement";
import type { Caravan, TradeRouteSegment } from "./marketTypes";
import { LAND_HIRE_SHARE, MerchantTransportAssets } from "./merchantTransportAssets";
import { seaDepartureMarketId, seaDeparturePortBurgId } from "./seaRoutePorts";
import { getGoodCargoSlotsPerUnit } from "./tradeCargo";

/** Days a month a vehicle can be out carrying. */
const MONTH_DAYS = 30;

type TransportMode = "land" | "sea";
/** Own land vehicles only; held alongside `land`. */
const OWN_LAND = "landOwn";

/**
 * Fleet capacity (slots) and what booked or moving cargo holds of it, by market and mode: slot-days
 * on land, slots at sea.
 */
export type TransportRoom = Map<string, { capacity: number; held: number }>;

/** Route of a booked lot, by origin and destination market. */
export type LotRouteLookup = (from: number, to: number) => readonly TradeRouteSegment[] | undefined;

function roomKey(marketId: number, mode: "land" | typeof OWN_LAND): string {
  return `${marketId}:${mode}`;
}

/** Sea room of one exporter at the port its route sails from; created on first use. */
function seaEntry(
  room: TransportRoom,
  marketId: number,
  segments: readonly TradeRouteSegment[] | undefined
): { capacity: number; held: number } {
  const portMarketId = seaDepartureMarketId(segments) ?? marketId;
  const key = `${marketId}:sea@${portMarketId}`;
  let entry = room.get(key);
  if (!entry) {
    entry = {
      capacity: MerchantTransportAssets.getSeaRoomCapacitySlots(
        marketId,
        portMarketId,
        seaDeparturePortBurgId(segments)
      ),
      held: 0
    };
    room.set(key, entry);
  }
  return entry;
}

/** The room entries a booking on this route draws on. */

/**
 * Modes whose vehicles the market must own for this route. River legs are left out: barges are
 * built for the cargo that waits for one (river-vessels-and-downstream-trade.md §10). Sea legs
 * count only while Shipbuilding publishes a finite fleet.
 */
function routeModes(segments: readonly TradeRouteSegment[] | undefined): TransportMode[] {
  if (!segments?.length) return ["land"];
  const modes: TransportMode[] = [];
  if (segments.some(segment => segment.type === "land")) modes.push("land");
  if (
    MerchantTransportAssets.needsOwnHulls() &&
    segments.some(segment => segment.type === "sea" || segment.type === "water")
  )
    modes.push("sea");
  return modes;
}

function payloadSlots(caravan: Pick<Caravan, "payload">): number {
  return caravan.payload.reduce((sum, item) => sum + item.units * (item.cargoSlotsPerUnit ?? 1), 0);
}

/** Cargo of `slots` on a trip of `days` holds land slot-days and, until it sails, sea slots. */
function hold(
  room: TransportRoom,
  marketId: number,
  segments: readonly TradeRouteSegment[] | undefined,
  slots: number,
  days: number,
  sailed = false
): void {
  if (!(slots > 0)) return;
  const modes = routeModes(segments);
  if (modes.includes("land")) {
    for (const key of [roomKey(marketId, "land"), roomKey(marketId, OWN_LAND)]) {
      const entry = room.get(key);
      if (entry) entry.held += slots * days;
    }
  }
  if (modes.includes("sea") && !sailed) seaEntry(room, marketId, segments).held += slots;
}

/** Each market's fleet capacity this cycle, less what cargo already booked or under way holds. */
export function buildTransportRoom(
  marketIds: readonly number[],
  lotRoute: LotRouteLookup,
  durationOf: (segments: readonly TradeRouteSegment[]) => number
): TransportRoom {
  const room: TransportRoom = new Map();
  for (const marketId of marketIds) {
    const land = MerchantTransportAssets.getFleetCapacitySlots(marketId, "land", DEFAULT_DRAFT_ANIMAL_ID);
    room.set(roomKey(marketId, "land"), { capacity: land * (1 + LAND_HIRE_SHARE), held: 0 });
    room.set(roomKey(marketId, OWN_LAND), { capacity: land, held: 0 });
  }

  const goods = new Map(getGoods().map(good => [good.i, good]));
  for (const lot of getExportStagingLots()) {
    const good = goods.get(lot.goodId);
    if (!good || !(lot.units > 0)) continue;
    const segments = lotRoute(lot.marketId, lot.destinationMarketId);
    const days = Math.max(1, lot.durationDays ?? 1);
    hold(room, lot.marketId, segments, lot.units * getGoodCargoSlotsPerUnit(good), days);
  }

  for (const caravan of getCaravans()) {
    if (caravan.state !== "loading" && caravan.state !== "transit") continue;
    const dispatcher = caravan.transportDispatcherMarketId ?? MerchantTransportAssets.getDispatcherMarketId(caravan);
    if (dispatcher === null) continue;
    const days = Math.max(1, durationOf(caravan.routeSegments));
    const left =
      caravan.state === "transit" && caravan.totalDistance > 0
        ? Math.max(0, 1 - caravan.currentDistance / caravan.totalDistance)
        : 1;
    hold(room, dispatcher, caravan.routeSegments, payloadSlots(caravan), days * left, caravan.state === "transit");
  }
  return room;
}

/** Slots the land fleet can still take on a trip of `days`: a month of work, or one trip if longer. */
function slotsLeft(entry: { capacity: number; held: number } | undefined, days: number): number {
  if (!entry) return Number.POSITIVE_INFINITY;
  return Math.max(0, entry.capacity * Math.max(MONTH_DAYS, days) - entry.held) / days;
}

/** Slots the hulls at the departure port can still take: one voyage each. */
function seaSlotsLeft(entry: { capacity: number; held: number }): number {
  return Math.max(0, entry.capacity - entry.held);
}

/** Slots the exporter's fleet can still take on this route this cycle (Infinity: no limit). */
export function transportRoomSlots(
  room: TransportRoom,
  marketId: number,
  segments: readonly TradeRouteSegment[] | undefined,
  durationDays: number
): number {
  const days = Math.max(1, durationDays);
  let slots = Number.POSITIVE_INFINITY;
  const modes = routeModes(segments);
  if (modes.includes("land")) slots = slotsLeft(room.get(roomKey(marketId, "land")), days);
  if (modes.includes("sea")) slots = Math.min(slots, seaSlotsLeft(seaEntry(room, marketId, segments)));
  return slots;
}

/** Slots the exporter's own carts can still take on this route; the rest would be hired (Infinity: no land leg). */
export function ownLandRoomSlots(
  room: TransportRoom,
  marketId: number,
  segments: readonly TradeRouteSegment[] | undefined,
  durationDays: number
): number {
  if (!routeModes(segments).includes("land")) return Number.POSITIVE_INFINITY;
  return slotsLeft(room.get(roomKey(marketId, OWN_LAND)), Math.max(1, durationDays));
}

/** Slots the hulls at the exporter's disposal can still take on this route (Infinity when it has no sea leg to sail). */
export function seaRoomSlots(
  room: TransportRoom,
  marketId: number,
  segments: readonly TradeRouteSegment[] | undefined,
  _durationDays: number
): number {
  if (!routeModes(segments).includes("sea")) return Number.POSITIVE_INFINITY;
  return seaSlotsLeft(seaEntry(room, marketId, segments));
}

/** A booking of `slots` on this route takes its share of the fleet. */
export function takeTransportRoom(
  room: TransportRoom,
  marketId: number,
  segments: readonly TradeRouteSegment[] | undefined,
  durationDays: number,
  slots: number
): void {
  hold(room, marketId, segments, slots, Math.max(1, durationDays));
}
