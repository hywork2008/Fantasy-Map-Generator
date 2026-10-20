/**
 * The ports a trade route's sea leg leaves from and arrives at
 * (docs/plan/port-freight-queue-and-warehouses.md §10.7).
 *
 * A market without a port of its own still trades by sea: its cargo goes overland to a port of
 * another market and is shipped there. That port is where the cargo waits for a ship, where a
 * ship lying in harbour can be chartered for it, and where idle ships are sent. The port is the
 * port burg nearest the first point of the route's first sea leg (and the last point of its last).
 */

import { getWorldContext } from "../economyContext";
import type { Caravan, TradeRoutePoint, TradeRouteSegment } from "./marketTypes";

let portIndex: {
  pack: unknown;
  ports: { burgId: number; x: number; y: number; marketId: number | undefined }[];
} | null = null;
const nearestCache = new Map<string, number | null>();

function ports() {
  const pack = getWorldContext().pack;
  if (portIndex?.pack !== pack) {
    nearestCache.clear();
    portIndex = {
      pack,
      ports: (pack.burgs ?? [])
        .filter(burg => burg?.i && !burg.removed && burg.port)
        .map(burg => ({
          burgId: burg.i as number,
          x: burg.x,
          y: burg.y,
          marketId: typeof burg.market === "number" ? burg.market : undefined
        }))
    };
  }
  return portIndex.ports;
}

function nearestPort(point: TradeRoutePoint | undefined): number | undefined {
  if (!point) return undefined;
  const all = ports();
  const key = `${point[0]},${point[1]}`;
  const cached = nearestCache.get(key);
  if (cached !== undefined) return cached ?? undefined;
  let best: { burgId: number; dist: number } | null = null;
  for (const port of all) {
    const dist = Math.hypot(port.x - point[0], port.y - point[1]);
    if (!best || dist < best.dist || (dist === best.dist && port.burgId < best.burgId))
      best = { burgId: port.burgId, dist };
  }
  nearestCache.set(key, best?.burgId ?? null);
  return best?.burgId;
}

function isSea(segment: TradeRouteSegment): boolean {
  return segment.type === "sea" || segment.type === "water";
}

/** Port burg the route's first sea leg leaves from; undefined without a sea leg or a port. */
export function seaDeparturePortBurgId(segments: readonly TradeRouteSegment[] | undefined): number | undefined {
  const leg = segments?.find(isSea);
  return leg ? nearestPort(leg.points[0]) : undefined;
}

/** Port burg the route's last sea leg arrives at. */
export function seaArrivalPortBurgId(segments: readonly TradeRouteSegment[] | undefined): number | undefined {
  const legs = segments?.filter(isSea) ?? [];
  const leg = legs[legs.length - 1];
  return leg ? nearestPort(leg.points[leg.points.length - 1]) : undefined;
}

/** Market of the port the route's sea leg leaves from. */
export function seaDepartureMarketId(segments: readonly TradeRouteSegment[] | undefined): number | undefined {
  const burgId = seaDeparturePortBurgId(segments);
  if (burgId === undefined) return undefined;
  const marketId = getWorldContext().pack.burgs?.[burgId]?.market;
  return typeof marketId === "number" ? marketId : undefined;
}

type StagedCaravan = Pick<Caravan, "routeSegments" | "portTransfer">;

/** Whether the shipment's cargo is still on its way to, or waiting to leave for, the port (§10.19). */
export function isInlandStage(caravan: StagedCaravan): boolean {
  return Boolean(caravan.portTransfer && !caravan.portTransfer.atPort);
}

/** Whether the shipment's cargo lies in the port warehouse, set down by the inland stage. */
export function isAtPort(caravan: StagedCaravan): boolean {
  return Boolean(caravan.portTransfer?.atPort);
}

/**
 * The route segments the shipment's current stage travels: the inland segments to the port, then
 * the sea and what follows it. A shipment without a transfer travels its whole route at once.
 */
export function stageSegments(caravan: StagedCaravan): readonly TradeRouteSegment[] {
  const transfer = caravan.portTransfer;
  if (!transfer) return caravan.routeSegments;
  return transfer.atPort
    ? caravan.routeSegments.slice(transfer.seaSegmentIndex)
    : caravan.routeSegments.slice(0, transfer.seaSegmentIndex);
}

export function clearSeaRoutePortCache(): void {
  portIndex = null;
  nearestCache.clear();
}
