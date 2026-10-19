/**
 * How much cargo each market's fleet can still take on this production cycle
 * (docs/plan/long-distance-merchant-reach-capital.md §17). Trade matching used to book whatever
 * stock and budget allowed: one month a market booked 398 cartloads of grain for a fleet of 44
 * carts, and most of it waited past the stale limit and was cancelled. A merchant does not buy what
 * he cannot carry within the month.
 *
 * Capacity is counted in slot-days: a vehicle of `c` slots works `c × 30` slot-days a month, and a
 * load of `s` slots on a trip of `d` days takes `s × d` of them (vehicles are back at the home
 * ledger on arrival). Cargo already booked, loading or on the road holds its share.
 */

import { getCaravans, getExportStagingLots, getGoods } from "../economyContext";
import { DEFAULT_DRAFT_ANIMAL_ID } from "./caravanMovement";
import type { Caravan, TradeRouteSegment } from "./marketTypes";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import { getGoodCargoSlotsPerUnit } from "./tradeCargo";

/** Days a month a vehicle can be out carrying. */
const MONTH_DAYS = 30;

type TransportMode = "land" | "sea";

/** Slot-days left this cycle, by market and mode. */
export type TransportRoom = Map<string, number>;

/** Route of a booked lot, by origin and destination market. */
export type LotRouteLookup = (from: number, to: number) => readonly TradeRouteSegment[] | undefined;

function roomKey(marketId: number, mode: TransportMode): string {
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
    const key = roomKey(marketId, mode);
    if (room.has(key)) room.set(key, (room.get(key) ?? 0) - slotDays);
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
    for (const mode of ["land", "sea"] as const) {
      const capacity = MerchantTransportAssets.getFleetCapacitySlots(marketId, mode, DEFAULT_DRAFT_ANIMAL_ID);
      room.set(roomKey(marketId, mode), capacity * MONTH_DAYS);
    }
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

/** Slots the exporter's fleet can still take on this route this cycle (Infinity: no limit). */
export function transportRoomSlots(
  room: TransportRoom,
  marketId: number,
  segments: readonly TradeRouteSegment[] | undefined,
  durationDays: number
): number {
  const days = Math.max(1, durationDays);
  let slots = Number.POSITIVE_INFINITY;
  for (const mode of routeModes(segments)) {
    const left = room.get(roomKey(marketId, mode));
    if (left === undefined) continue;
    slots = Math.min(slots, Math.max(0, left) / days);
  }
  return slots;
}

/** Slots the exporter's own hulls can still take on this route (Infinity when it has no sea leg to sail). */
export function seaRoomSlots(
  room: TransportRoom,
  marketId: number,
  segments: readonly TradeRouteSegment[] | undefined,
  durationDays: number
): number {
  if (!routeModes(segments).includes("sea")) return Number.POSITIVE_INFINITY;
  return Math.max(0, room.get(roomKey(marketId, "sea")) ?? 0) / Math.max(1, durationDays);
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
