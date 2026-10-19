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
 * Land room counts the carts the market may hire on top of its own, and sea room counts other
 * markets' hulls lying at its ports (docs/plan/port-freight-queue-and-warehouses.md §3, §4.2).
 * A separate own-land count tells the booking how much of a load rides on hired carts.
 */

import { getCaravans, getExportStagingLots, getGoods } from "../economyContext";
import { DEFAULT_DRAFT_ANIMAL_ID } from "./caravanMovement";
import type { Caravan, TradeRouteSegment } from "./marketTypes";
import { LAND_HIRE_SHARE, MerchantTransportAssets } from "./merchantTransportAssets";
import { getGoodCargoSlotsPerUnit } from "./tradeCargo";

/** Days a month a vehicle can be out carrying. */
const MONTH_DAYS = 30;

type TransportMode = "land" | "sea";
/** Own land vehicles only; held alongside `land`. */
const OWN_LAND = "landOwn";

/** Fleet capacity (slots) and slot-days held by booked or moving cargo, by market and mode. */
export type TransportRoom = Map<string, { capacity: number; held: number }>;

/** Route of a booked lot, by origin and destination market. */
export type LotRouteLookup = (from: number, to: number) => readonly TradeRouteSegment[] | undefined;

function roomKey(marketId: number, mode: TransportMode | typeof OWN_LAND): string {
  return `${marketId}:${mode}`;
}

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

function hold(room: TransportRoom, marketId: number, modes: readonly TransportMode[], slotDays: number): void {
  if (!(slotDays > 0)) return;
  for (const mode of modes) {
    for (const key of mode === "land"
      ? [roomKey(marketId, mode), roomKey(marketId, OWN_LAND)]
      : [roomKey(marketId, mode)]) {
      const entry = room.get(key);
      if (entry) entry.held += slotDays;
    }
  }
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
    const sea =
      MerchantTransportAssets.getFleetCapacitySlots(marketId, "sea", DEFAULT_DRAFT_ANIMAL_ID) +
      MerchantTransportAssets.getCharterableSeaCapacitySlots(marketId);
    room.set(roomKey(marketId, "sea"), { capacity: sea, held: 0 });
  }

  const goods = new Map(getGoods().map(good => [good.i, good]));
  for (const lot of getExportStagingLots()) {
    const good = goods.get(lot.goodId);
    if (!good || !(lot.units > 0)) continue;
    const segments = lotRoute(lot.marketId, lot.destinationMarketId);
    const days = Math.max(1, lot.durationDays ?? 1);
    hold(room, lot.marketId, routeModes(segments), lot.units * getGoodCargoSlotsPerUnit(good) * days);
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
    hold(room, dispatcher, routeModes(caravan.routeSegments), payloadSlots(caravan) * days * left);
  }
  return room;
}

/** Slots one mode's fleet can still take on a trip of `days`: a month of work, or one trip if longer. */
function slotsLeft(entry: { capacity: number; held: number } | undefined, days: number): number {
  if (!entry) return Number.POSITIVE_INFINITY;
  return Math.max(0, entry.capacity * Math.max(MONTH_DAYS, days) - entry.held) / days;
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
  for (const mode of routeModes(segments)) slots = Math.min(slots, slotsLeft(room.get(roomKey(marketId, mode)), days));
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
  durationDays: number
): number {
  if (!routeModes(segments).includes("sea")) return Number.POSITIVE_INFINITY;
  return slotsLeft(room.get(roomKey(marketId, "sea")) ?? { capacity: 0, held: 0 }, Math.max(1, durationDays));
}

/** A booking of `slots` on this route takes its share of the fleet. */
export function takeTransportRoom(
  room: TransportRoom,
  marketId: number,
  segments: readonly TradeRouteSegment[] | undefined,
  durationDays: number,
  slots: number
): void {
  hold(room, marketId, routeModes(segments), slots * Math.max(1, durationDays));
}
