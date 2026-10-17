/**
 * Approach (gate) traffic ledger (docs/plan/approach-traffic-observatory.md §4).
 *
 * TradeCorridor keys a journey by burg pair and Route.traffic by whole route, so a route running
 * through a town credits both of its gates alike. This ledger records which approach each journey
 * left and entered by, plus the towns it passed through. It is written only: no system reads it,
 * so recording does not change the simulation.
 */

import { approachIdForLeg, openApproachId, riverApproachId, seaApproachId } from "../../../services/approachId";
import type { PackedGraph } from "../../../types/PackedGraph";
import { findCell, rn } from "../../hostUtils";
import {
  getApproachLedgerDecays,
  getApproachTraffic,
  getGoods,
  getWorldContext,
  isEconomyContextReady,
  setApproachLedgerDecays,
  setApproachTraffic
} from "../economyContext";
import type { ApproachJourney, ApproachMode, ApproachTraffic } from "./approachLedgerTypes";
import type { TradeRouteSegment } from "./marketTypes";
import type { MarketShipment } from "./retailInventoryTypes";
import { getGoodCargoSlotsPerUnit } from "./tradeCargo";

/** Same as CORRIDOR_ANNUAL_RETENTION / MIN_STOCK (tradeCorridorLedger.ts imports this module). */
export const APPROACH_ANNUAL_RETENTION = 0.7;
const MIN_STOCK = 0.05;
const KEPT = 8;

export interface ApproachRef {
  burgId: number;
  approachId: string;
  routeId: number | null;
  mode: ApproachMode;
}

export interface JourneyApproaches {
  outbound: ApproachRef | null;
  inbound: ApproachRef | null;
  /** Two entries per town passed: the approach entered by and the one left by. */
  through: ApproachRef[];
}

interface PathPoint {
  x: number;
  y: number;
  cell: number;
  type: TradeRouteSegment["type"];
}

type Pack = Pick<PackedGraph, "cells" | "burgs">;

function flatten(segments: readonly TradeRouteSegment[], cellAt: (x: number, y: number) => number): PathPoint[] {
  const points: PathPoint[] = [];
  for (const segment of segments) {
    for (const point of segment.points) {
      const cell = point[2] ?? cellAt(point[0], point[1]);
      points.push({ x: point[0], y: point[1], cell, type: segment.type });
    }
  }
  return points;
}

/**
 * The approach of `burgId` used to step from `inside` (a point in the burg cell) to `outside`
 * (the first point beyond it).
 */
function approachBetween(pack: Pack, burgId: number, inside: PathPoint, outside: PathPoint): ApproachRef {
  const burg = pack.burgs[burgId];
  if (outside.type === "sea" || outside.type === "water")
    return { burgId, approachId: seaApproachId(burgId), routeId: null, mode: "sea" };
  if (outside.type === "river") {
    const flux = pack.cells.fl;
    const downstream = flux ? (flux[outside.cell] ?? 0) >= (flux[inside.cell] ?? 0) : true;
    return { burgId, approachId: riverApproachId(burgId, downstream), routeId: null, mode: "river" };
  }
  const routeId = pack.cells.routes?.[inside.cell]?.[outside.cell];
  if (routeId !== undefined)
    return {
      burgId,
      approachId: approachIdForLeg(burgId, burg.cell, routeId, [
        [inside.x, inside.y, inside.cell],
        [outside.x, outside.y, outside.cell]
      ]),
      routeId,
      mode: "land"
    };
  return {
    burgId,
    approachId: openApproachId(burgId, outside.x - burg.x, outside.y - burg.y),
    routeId: null,
    mode: "open"
  };
}

/** The end approach of `burgId` on a path that starts in its cell. */
function endApproach(pack: Pack, burgId: number, path: readonly PathPoint[]): ApproachRef | null {
  const burg = pack.burgs[burgId];
  if (!burg || !path.length) return null;
  const exit = path.findIndex(point => point.cell !== burg.cell);
  if (exit < 0) return null;
  const inside = exit > 0 ? path[exit - 1] : { x: burg.x, y: burg.y, cell: burg.cell, type: path[0].type };
  return approachBetween(pack, burgId, inside, path[exit]);
}

/** Origin, destination and pass-through approaches of one journey. Pure; `pack` is only read. */
export function approachesOfJourney(
  pack: Pack,
  segments: readonly TradeRouteSegment[],
  originBurgId: number,
  destinationBurgId: number,
  cellAt: (x: number, y: number) => number = () => -1
): JourneyApproaches {
  const path = flatten(segments, cellAt);
  const through: ApproachRef[] = [];
  const burgOfCell = pack.cells.burg;
  for (let start = 1; start < path.length - 1; start++) {
    if (path[start].type !== "land") continue;
    const burgId = burgOfCell?.[path[start].cell] ?? 0;
    if (!burgId || burgId === originBurgId || burgId === destinationBurgId) continue;
    if (path[start - 1].cell === path[start].cell) continue;
    let end = start;
    while (end + 1 < path.length && path[end + 1].cell === path[start].cell) end++;
    if (end + 1 >= path.length) break;
    through.push(approachBetween(pack, burgId, path[start], path[start - 1]));
    through.push(approachBetween(pack, burgId, path[end], path[end + 1]));
    start = end;
  }
  return {
    outbound: endApproach(pack, originBurgId, path),
    inbound: endApproach(pack, destinationBurgId, path.slice().reverse()),
    through
  };
}

/**
 * For a journey with no stored path (same-market shipments): the route out of the burg cell that
 * points most nearly at the partner, or the open bearing when the cell has no route.
 */
export function approachTowards(pack: Pack, burgId: number, partnerBurgId: number): ApproachRef | null {
  const burg = pack.burgs[burgId];
  const partner = pack.burgs[partnerBurgId];
  if (!burg || !partner) return null;
  const dx = partner.x - burg.x;
  const dy = partner.y - burg.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return null;
  let best: { cell: number; routeId: number; score: number } | null = null;
  for (const [cell, routeId] of Object.entries(pack.cells.routes?.[burg.cell] ?? {})) {
    const neighbour = Number(cell);
    const p = pack.cells.p[neighbour];
    if (!p) continue;
    const ndx = p[0] - burg.x;
    const ndy = p[1] - burg.y;
    const score = (ndx * dx + ndy * dy) / ((Math.hypot(ndx, ndy) || 1) * length);
    if (!best || score > best.score) best = { cell: neighbour, routeId, score };
  }
  if (!best) return { burgId, approachId: openApproachId(burgId, dx, dy), routeId: null, mode: "open" };
  return {
    burgId,
    approachId: approachIdForLeg(burgId, burg.cell, best.routeId, [
      [burg.x, burg.y, burg.cell],
      [0, 0, best.cell]
    ]),
    routeId: best.routeId,
    mode: "land"
  };
}

function emptyRow(ref: ApproachRef): ApproachTraffic {
  return {
    approachId: ref.approachId,
    burgId: ref.burgId,
    routeId: ref.routeId,
    mode: ref.mode,
    inbound: { departures: 0, cargoSlots: 0, value: 0 },
    outbound: { departures: 0, cargoSlots: 0, value: 0 },
    through: { departures: 0, cargoSlots: 0 },
    goodsSlots: {},
    partners: {}
  };
}

function trim(record: Record<string, number>): Record<string, number> {
  const entries = Object.entries(record);
  if (entries.length <= KEPT) return record;
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, KEPT));
}

/** Folds one journey into `rows` in place and returns it. */
export function applyApproachJourney(
  rows: ApproachTraffic[],
  approaches: JourneyApproaches,
  journey: ApproachJourney
): ApproachTraffic[] {
  const index = new Map(rows.map((row, at) => [row.approachId, at]));
  const rowOf = (ref: ApproachRef) => {
    let at = index.get(ref.approachId);
    if (at === undefined) {
      at = rows.push(emptyRow(ref)) - 1;
      index.set(ref.approachId, at);
    }
    return rows[at];
  };
  const slots = Math.max(0, journey.cargoSlots);
  const value = Math.max(0, journey.value);
  const end = (ref: ApproachRef | null, side: "inbound" | "outbound", partner: number) => {
    if (!ref) return;
    const row = rowOf(ref);
    const flow = row[side];
    flow.departures = rn(flow.departures + 1, 3);
    flow.cargoSlots = rn(flow.cargoSlots + slots, 3);
    flow.value = rn(flow.value + value, 3);
    if (slots > 0) {
      row.partners[partner] = rn((row.partners[partner] ?? 0) + slots, 3);
      row.partners = trim(row.partners);
      for (const good of journey.goods) {
        if (!(good.slots > 0)) continue;
        row.goodsSlots[good.id] = rn((row.goodsSlots[good.id] ?? 0) + good.slots, 3);
      }
      row.goodsSlots = trim(row.goodsSlots);
    }
  };
  end(approaches.outbound, "outbound", journey.destinationBurgId);
  end(approaches.inbound, "inbound", journey.originBurgId);
  for (const ref of approaches.through) {
    const row = rowOf(ref);
    row.through.departures = rn(row.through.departures + 1, 3);
    row.through.cargoSlots = rn(row.through.cargoSlots + slots, 3);
  }
  return rows;
}

function decayRecord(record: Record<string, number>, retention: number): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, amount] of Object.entries(record)) {
    const kept = rn(amount * retention, 3);
    if (kept >= MIN_STOCK) next[key] = kept;
  }
  return next;
}

/** Yearly decay, same retention and floor as the corridor ledger. */
export function decayApproachRows(
  rows: readonly ApproachTraffic[],
  retention = APPROACH_ANNUAL_RETENTION
): ApproachTraffic[] {
  const kept: ApproachTraffic[] = [];
  const flow = (f: ApproachTraffic["inbound"]) => ({
    departures: rn(f.departures * retention, 3),
    cargoSlots: rn(f.cargoSlots * retention, 3),
    value: rn(f.value * retention, 3)
  });
  for (const row of rows) {
    const inbound = flow(row.inbound);
    const outbound = flow(row.outbound);
    const through = {
      departures: rn(row.through.departures * retention, 3),
      cargoSlots: rn(row.through.cargoSlots * retention, 3)
    };
    const departures = inbound.departures + outbound.departures + through.departures;
    const slots = inbound.cargoSlots + outbound.cargoSlots + through.cargoSlots;
    if (departures < MIN_STOCK && slots < MIN_STOCK) continue;
    kept.push({
      ...row,
      inbound,
      outbound,
      through,
      goodsSlots: decayRecord(row.goodsSlots, retention),
      partners: decayRecord(row.partners, retention)
    });
  }
  return kept;
}

function livePack(): Pack | null {
  const pack = getWorldContext().pack;
  return pack?.cells && pack.burgs ? pack : null;
}

/** A caravan leaving with a planned path (commercial and state procurement). */
export function recordJourneyApproaches(segments: readonly TradeRouteSegment[], journey: ApproachJourney): void {
  if (!isEconomyContextReady()) return;
  const pack = livePack();
  if (!pack) return;
  const approaches = approachesOfJourney(pack, segments, journey.originBurgId, journey.destinationBurgId, findCell);
  setApproachTraffic(applyApproachJourney(getApproachTraffic(), approaches, journey));
}

/** A same-market shipment, which keeps no path: both ends take the route facing the partner. */
export function recordShipmentApproaches(shipment: MarketShipment): void {
  if (!isEconomyContextReady()) return;
  const pack = livePack();
  if (!pack) return;
  const good = getGoods().find(entry => entry.i === shipment.goodId);
  const slots = Math.max(0, shipment.units) * (good ? getGoodCargoSlotsPerUnit(good) : 1);
  const approaches: JourneyApproaches = {
    outbound: approachTowards(pack, shipment.originBurgId, shipment.destinationBurgId),
    inbound: approachTowards(pack, shipment.destinationBurgId, shipment.originBurgId),
    through: []
  };
  setApproachTraffic(
    applyApproachJourney(getApproachTraffic(), approaches, {
      originBurgId: shipment.originBurgId,
      destinationBurgId: shipment.destinationBurgId,
      cargoSlots: slots,
      value: 0,
      goods: slots > 0 ? [{ id: shipment.goodId, slots }] : []
    })
  );
}

export function decayApproachTraffic(): void {
  if (!isEconomyContextReady()) return;
  const rows = getApproachTraffic();
  if (rows.length) setApproachTraffic(decayApproachRows(rows));
  // Route.traffic and the corridor ledger decay at the same settlement.
  setApproachLedgerDecays(getApproachLedgerDecays() + 1);
}

/** The site-descriptor view of one burg's rows (`burgEconomyExtensions.getBurgApproachTraffic`). */
export function burgApproachTraffic(burgId: number) {
  if (!isEconomyContextReady()) return [];
  return getApproachTraffic()
    .filter(row => row.burgId === burgId)
    .map(row => ({
      approachId: row.approachId,
      routeId: row.routeId,
      cargoSlots: rn(row.inbound.cargoSlots + row.outbound.cargoSlots, 3),
      through: row.through.departures
    }));
}
