import type { PackedGraph } from "../types/PackedGraph";
import { MIN_NAVIGABLE_FLUX } from "./river-generator";

export const DEFAULT_SHELTERED_WATER_MINIMUM_ENCLOSURE = 60;

export type RiverNavigationEdgeKind = "downstream" | "shelteredWater";

export type RiverNavigationEdge = {
  fromCellId: number;
  toCellId: number;
  riverId: number;
  distanceMapUnits: number;
  kind: RiverNavigationEdgeKind;
};

export interface RiverNavigationGraph {
  readonly outgoing: ReadonlyMap<number, readonly RiverNavigationEdge[]>;
  getOutgoing(cellId: number): readonly RiverNavigationEdge[];
  isDownstreamEdge(fromCellId: number, toCellId: number): boolean;
}

export type RiverNavigationPath = {
  cellIds: number[];
  edges: RiverNavigationEdge[];
  distanceMapUnits: number;
};

export interface RiverNavigationGraphOptions {
  minNavigableFlux?: number;
  shelteredWaterMinimumEnclosure?: number;
}

function getDistance(pack: Readonly<PackedGraph>, fromCellId: number, toCellId: number): number {
  const from = pack.cells.p[fromCellId];
  const to = pack.cells.p[toCellId];
  if (!from || !to) return 0;
  return Math.hypot(to[0] - from[0], to[1] - from[1]);
}

function isNavigableRiverCell(pack: Readonly<PackedGraph>, cellId: number, minNavigableFlux: number): boolean {
  return cellId >= 0 && Boolean(pack.cells.r[cellId]) && (pack.cells.fl[cellId] ?? 0) >= minNavigableFlux;
}

function isShelteredWaterCell(
  pack: Readonly<PackedGraph>,
  cellId: number,
  shelteredWaterMinimumEnclosure: number
): boolean {
  return (
    cellId >= 0 && pack.cells.h[cellId] < 20 && (pack.cells.enclosure?.[cellId] ?? 0) >= shelteredWaterMinimumEnclosure
  );
}

/**
 * Builds downstream-only navigation edges from River.cells, whose order is source to mouth.
 * This deliberately does not write to pack.cells.routes: that shared route link table is
 * bidirectional and therefore cannot represent a one-way river journey safely.
 */
export function buildRiverNavigationGraph(
  pack: Readonly<PackedGraph>,
  options: RiverNavigationGraphOptions = {}
): RiverNavigationGraph {
  const minNavigableFlux = options.minNavigableFlux ?? MIN_NAVIGABLE_FLUX;
  const shelteredWaterMinimumEnclosure =
    options.shelteredWaterMinimumEnclosure ?? DEFAULT_SHELTERED_WATER_MINIMUM_ENCLOSURE;
  const outgoing = new Map<number, RiverNavigationEdge[]>();

  const addEdge = (edge: RiverNavigationEdge) => {
    const edges = outgoing.get(edge.fromCellId);
    if (edges) edges.push(edge);
    else outgoing.set(edge.fromCellId, [edge]);
  };

  for (const river of pack.rivers ?? []) {
    if (!river?.cells) continue;

    for (let index = 0; index < river.cells.length - 1; index++) {
      const fromCellId = river.cells[index];
      const toCellId = river.cells[index + 1];
      if (!isNavigableRiverCell(pack, fromCellId, minNavigableFlux) || toCellId < 0) continue;

      const kind: RiverNavigationEdgeKind | null = isNavigableRiverCell(pack, toCellId, minNavigableFlux)
        ? "downstream"
        : isShelteredWaterCell(pack, toCellId, shelteredWaterMinimumEnclosure)
          ? "shelteredWater"
          : null;
      if (!kind) continue;

      addEdge({
        fromCellId,
        toCellId,
        riverId: river.i,
        distanceMapUnits: getDistance(pack, fromCellId, toCellId),
        kind
      });
    }
  }

  for (const edges of outgoing.values()) {
    edges.sort((left, right) => left.toCellId - right.toCellId || left.riverId - right.riverId);
  }

  return {
    outgoing,
    getOutgoing(cellId) {
      return outgoing.get(cellId) ?? [];
    },
    isDownstreamEdge(fromCellId, toCellId) {
      return (outgoing.get(fromCellId) ?? []).some(edge => edge.toCellId === toCellId && edge.kind === "downstream");
    }
  };
}

/**
 * Finds the shortest directed downstream path. No reverse edge is ever invented, so callers
 * cannot accidentally turn a one-way river vessel into an upstream-capable sea vessel.
 */
export function findDownstreamRiverPath(
  graph: RiverNavigationGraph,
  startCellId: number,
  endCellId: number
): RiverNavigationPath | null {
  if (startCellId === endCellId || !graph.outgoing.has(startCellId)) return null;

  const distances = new Map<number, number>([[startCellId, 0]]);
  const previous = new Map<number, RiverNavigationEdge>();
  const unsettled = new Set<number>([startCellId]);

  while (unsettled.size) {
    let currentCellId: number | undefined;
    let currentDistance = Infinity;
    for (const candidate of unsettled) {
      const distance = distances.get(candidate) ?? Infinity;
      if (distance < currentDistance) {
        currentCellId = candidate;
        currentDistance = distance;
      }
    }
    if (currentCellId === undefined) break;
    unsettled.delete(currentCellId);
    if (currentCellId === endCellId) break;

    for (const edge of graph.getOutgoing(currentCellId)) {
      const nextDistance = currentDistance + edge.distanceMapUnits;
      if (nextDistance >= (distances.get(edge.toCellId) ?? Infinity)) continue;
      distances.set(edge.toCellId, nextDistance);
      previous.set(edge.toCellId, edge);
      unsettled.add(edge.toCellId);
    }
  }

  const distanceMapUnits = distances.get(endCellId);
  if (distanceMapUnits === undefined) return null;

  const edges: RiverNavigationEdge[] = [];
  let cursor = endCellId;
  while (cursor !== startCellId) {
    const edge = previous.get(cursor);
    if (!edge) return null;
    edges.push(edge);
    cursor = edge.fromCellId;
  }
  edges.reverse();

  return {
    cellIds: [startCellId, ...edges.map(edge => edge.toCellId)],
    edges,
    distanceMapUnits
  };
}
