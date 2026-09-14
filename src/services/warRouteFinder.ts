import { curveCatmullRom, line } from "d3";
import FlatQueue from "flatqueue";
import { buildLandRouteGraph, findLandRoutePath } from "../generators/landRouteGraph";
import { buildSeaRouteGraph, findSeaRoutePath } from "../generators/seaRouteGraph";
import type { PackedGraph } from "../types/PackedGraph";
import { findPath } from "../utils/pathUtils";

/**
 * Finds off-road land cells path between start and end cell (avoids ocean/water).
 * Implements realistic terrain costs: penalizes high alpine mountains (h >= 60-75) and steep slopes,
 * guiding armies through passes and valleys instead of bizarre "crossing the Alps" operations.
 * If allowedStates is specified, avoids marching across unauthorized third-party countries.
 */
export function findOffRoadLandPath(
  pack: PackedGraph,
  start: number,
  end: number,
  allowedStates?: Set<number>
): number[] | null {
  if (start === end) return [start];
  const { cells } = pack;
  const getCost = (current: number, next: number) => {
    if (cells.h[next] < 20) return Infinity; // Water cannot be traversed off-road

    // Check third-party country boundary: cannot trespass through unpermitted countries
    if (allowedStates && cells.state) {
      const s = cells.state[next];
      if (s !== 0 && !allowedStates.has(s)) {
        return Infinity;
      }
    }

    // Terrain realism: avoid "crossing the Alps" (extreme alpine peaks / steep mountain ridges)
    let terrainCost = 1.0;
    const h = cells.h[next];
    if (h >= 75) {
      terrainCost += 100;
    } else if (h >= 60) {
      terrainCost += 20 + (h - 60) * 3;
    } else if (h >= 45) {
      terrainCost += 4 + (h - 45) * 0.5;
    }

    // Slope penalty: steep climbs or descents are heavily penalized so paths naturally follow passes/valleys
    const dh = Math.abs(cells.h[next] - cells.h[current]);
    terrainCost += dh * 3;

    const dx = cells.p[next][0] - cells.p[current][0];
    const dy = cells.p[next][1] - cells.p[current][1];
    return Math.hypot(dx, dy) * terrainCost;
  };
  return findPath(start, id => id === end, getCost, pack);
}

/**
 * Finds off-road water cells path between start and end cell (traverses ocean/water cells).
 */
export function findOffRoadSeaPath(pack: PackedGraph, start: number, end: number): number[] | null {
  if (start === end) return [start];
  const { cells } = pack;
  const getCost = (current: number, next: number) => {
    // Both endpoints can be ports/coastal land, but intermediate cells must be water
    if (next !== end && cells.h[next] >= 20) return Infinity;
    const dx = cells.p[next][0] - cells.p[current][0];
    const dy = cells.p[next][1] - cells.p[current][1];
    return Math.hypot(dx, dy);
  };
  return findPath(start, id => id === end, getCost, pack);
}

/**
 * Finds the exit path from a burg (which may be a coastal port, harbor, or river port) to open water.
 * Returns an array of cells starting at burg.cell and ending at a water cell (cells.h < 20).
 */
export function findWaterExitPath(pack: PackedGraph, burg: { cell: number; port?: number }): number[] | null {
  const { cells } = pack;
  const start = burg.cell;

  // If start is already water
  if (cells.h[start] < 20) return [start];

  // If haven is a valid water cell
  const haven = cells.haven?.[start];
  if (haven !== undefined && haven > 0 && cells.h[haven] < 20) {
    if (!burg.port || cells.f[haven] === burg.port) {
      return [start, haven];
    }
  }

  // Check direct neighbors for water matching burg.port
  const neighbors = cells.c[start];
  if (burg.port) {
    for (const n of neighbors) {
      if (cells.h[n] < 20 && cells.f[n] === burg.port) {
        return [start, n];
      }
    }
  }

  // Check direct neighbors for any water
  for (const n of neighbors) {
    if (cells.h[n] < 20) {
      return [start, n];
    }
  }

  // Search for the nearest water cell (prioritizing rivers / downhill flow to the ocean)
  const queue: number[] = [start];
  const visited = new Set<number>([start]);
  const parent = new Map<number, number>();

  let foundWater: number | null = null;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (cells.h[curr] < 20) {
      if (!burg.port || cells.f[curr] === burg.port) {
        foundWater = curr;
        break;
      }
    }

    const nbrs = cells.c[curr];
    // Prioritize water cells, then river cells (cells.r > 0), then lower elevation
    const sortedNbrs = [...nbrs].sort((a, b) => {
      const aWater = cells.h[a] < 20 ? 1 : 0;
      const bWater = cells.h[b] < 20 ? 1 : 0;
      if (aWater !== bWater) return bWater - aWater;
      const aRiver = (cells.r?.[a] ?? 0) > 0 ? 1 : 0;
      const bRiver = (cells.r?.[b] ?? 0) > 0 ? 1 : 0;
      if (aRiver !== bRiver) return bRiver - aRiver;
      return cells.h[a] - cells.h[b];
    });

    for (const n of sortedNbrs) {
      if (!visited.has(n)) {
        visited.add(n);
        parent.set(n, curr);
        queue.push(n);
      }
    }
  }

  if (foundWater === null) return null;

  const path = [foundWater];
  let curr = foundWater;
  while (parent.has(curr)) {
    curr = parent.get(curr)!;
    path.push(curr);
  }
  return path.reverse();
}

/**
 * Finds a complete naval expedition route connecting two burgs across water.
 * Navigates out of the origin burg to the sea, sails across water cells
 * (preferring charted sea routes via a cost discount), and enters the target port.
 */
export function findNavalExpeditionRoute(
  pack: PackedGraph,
  fromBurg: { cell: number; port?: number },
  toBurg: { cell: number; port?: number }
): number[] | null {
  const fromWaterPath = findWaterExitPath(pack, fromBurg);
  const toWaterPath = findWaterExitPath(pack, toBurg);
  if (!fromWaterPath || !toWaterPath) return null;

  const fromWater = fromWaterPath[fromWaterPath.length - 1];
  const toWater = toWaterPath[toWaterPath.length - 1];

  const { cells } = pack;
  if (cells.f[fromWater] !== cells.f[toWater]) return null;
  const featureId = cells.f[fromWater];

  // Collect charted sea route cells to discount their traversal cost
  const seaRouteCells = new Set<number>();
  for (const route of pack.routes ?? []) {
    if (route.group === "searoutes" && route.navigation !== "river") {
      for (const pt of route.points) {
        if (pt[2] !== undefined) seaRouteCells.add(pt[2]);
      }
    }
  }

  const dist = new Map<number, number>();
  const from = new Map<number, number>();
  const queue = new FlatQueue<number>();

  dist.set(fromWater, 0);
  queue.push(fromWater, 0);

  const settled = new Set<number>();

  while (queue.length > 0) {
    const currentDist = queue.peekValue()!;
    const curr = queue.pop()!;
    if (settled.has(curr)) continue;
    settled.add(curr);

    if (curr === toWater) break;

    for (const next of cells.c[curr]) {
      if (settled.has(next)) continue;
      // Water traversal must stay in the same water body
      if (next !== toWater && (cells.h[next] >= 20 || cells.f[next] !== featureId)) continue;

      const d = Math.hypot(cells.p[next][0] - cells.p[curr][0], cells.p[next][1] - cells.p[curr][1]);
      // Charted sea lanes get a significant discount to guide fleets through realistic lanes
      const weight = seaRouteCells.has(next) ? 0.35 : 1.0;
      const total = currentDist + d * weight;

      if (total < (dist.get(next) ?? Infinity)) {
        dist.set(next, total);
        from.set(next, curr);
        queue.push(next, total);
      }
    }
  }

  if (!dist.has(toWater)) return null;

  const waterPath = [toWater];
  let curr = toWater;
  while (from.has(curr)) {
    curr = from.get(curr)!;
    waterPath.push(curr);
  }
  waterPath.reverse();

  // Combine: fromBurg -> ... -> fromWater -> ... -> toWater -> ... -> toBurg
  const fullPath = [...fromWaterPath.slice(0, -1), ...waterPath, ...toWaterPath.slice(0, -1).reverse()];
  const result: number[] = [];
  for (const c of fullPath) {
    if (result.length === 0 || result[result.length - 1] !== c) {
      result.push(c);
    }
  }
  return result;
}

/**
 * Finds the sequence of cells for a military operation from `fromBurgId` to `toBurgId`.
 * If transitType is "naval_expedition", sea routes are prioritized.
 * Otherwise, land roads and off-road land paths are traversed.
 */
export function findWarRouteCells(
  pack: PackedGraph,
  fromBurgId?: number,
  toBurgId?: number,
  transitType?: "naval_expedition" | "military_transit" | "direct_border"
): number[] | null {
  if (fromBurgId === undefined || toBurgId === undefined) return null;
  const fromBurg = pack.burgs?.find(b => b && b.i === fromBurgId && !b.removed);
  const toBurg = pack.burgs?.find(b => b && b.i === toBurgId && !b.removed);
  if (!fromBurg || !toBurg) return null;

  const startCell = fromBurg.cell;
  const endCell = toBurg.cell;
  if (startCell === endCell) return [startCell];

  if (transitType === "naval_expedition") {
    // Dedicated naval expedition route (handles ocean traversal, charted sea lanes discount, and harbor/estuary entry/exit)
    const navalRoute = findNavalExpeditionRoute(pack, fromBurg, toBurg);
    if (navalRoute && navalRoute.length >= 2) return navalRoute;

    // Chartered sea routes fallback
    const seaGraph = buildSeaRouteGraph(pack);
    const seaPath = findSeaRoutePath(seaGraph, startCell, endCell);
    if (seaPath && seaPath.length > 0) return seaPath;

    // Off-road sea path fallback
    const offRoadSea = findOffRoadSeaPath(pack, startCell, endCell);
    if (offRoadSea && offRoadSea.length > 0) return offRoadSea;

    // A naval expedition must not march across overland nations or draw straight lines across land
    return null;
  }

  // Define allowed states for land route: belligerents (and neutral wilderness)
  const allowedStates = new Set<number>();
  if (fromBurg.state) allowedStates.add(fromBurg.state);
  if (toBurg.state) allowedStates.add(toBurg.state);

  // Land invasion: check charted land routes
  const landGraph = buildLandRouteGraph(pack);
  const landPath = findLandRoutePath(landGraph, startCell, endCell);
  if (landPath && landPath.length > 0) {
    // Ensure land path doesn't cut through unrelated third-party countries off-limits
    const cutsThirdParty = landPath.some(c => {
      const s = pack.cells.state?.[c];
      return s !== undefined && s !== 0 && !allowedStates.has(s);
    });
    if (!cutsThirdParty) return landPath;
  }

  // Off-road land path fallback (avoids alpine peaks and third-party countries)
  const offRoadLand = findOffRoadLandPath(pack, startCell, endCell, allowedStates);
  if (offRoadLand && offRoadLand.length > 0) return offRoadLand;

  // Sea path fallback if land cannot connect (e.g. across bay or maritime connection)
  const navalFallback = findNavalExpeditionRoute(pack, fromBurg, toBurg);
  if (navalFallback && navalFallback.length >= 2) return navalFallback;

  const seaGraph = buildSeaRouteGraph(pack);
  const seaPath = findSeaRoutePath(seaGraph, startCell, endCell);
  if (seaPath && seaPath.length > 0) return seaPath;

  const offRoadSea = findOffRoadSeaPath(pack, startCell, endCell);
  if (offRoadSea && offRoadSea.length > 0) return offRoadSea;

  return null;
}

/**
 * Resolves 2D coordinate points [x, y][] along the war route from fromBurg to toBurg.
 */
export function getWarRouteCoordinates(
  pack: PackedGraph,
  fromBurgId?: number,
  toBurgId?: number,
  transitType?: "naval_expedition" | "military_transit" | "direct_border",
  precomputedCells?: number[]
): [number, number][] {
  const fromBurg = fromBurgId ? pack.burgs?.find(b => b && b.i === fromBurgId && !b.removed) : undefined;
  const toBurg = toBurgId ? pack.burgs?.find(b => b && b.i === toBurgId && !b.removed) : undefined;

  const cells =
    precomputedCells && precomputedCells.length > 0
      ? precomputedCells
      : findWarRouteCells(pack, fromBurgId, toBurgId, transitType);

  if (!cells || cells.length === 0) {
    if (transitType === "naval_expedition") {
      // Disallow straight lines over land when no maritime path exists
      return [];
    }
    if (
      fromBurg &&
      toBurg &&
      fromBurg.state != null &&
      toBurg.state != null &&
      pack.states?.[fromBurg.state]?.neighbors?.includes(toBurg.state)
    ) {
      return [
        [fromBurg.x, fromBurg.y],
        [toBurg.x, toBurg.y]
      ];
    }
    return [];
  }

  const points: [number, number][] = cells.map(c => [pack.cells.p[c][0], pack.cells.p[c][1]]);

  // Snap the exact endpoints to the burg positions for visual precision
  if (fromBurg) points[0] = [fromBurg.x, fromBurg.y];
  if (toBurg) points[points.length - 1] = [toBurg.x, toBurg.y];

  return points;
}

/**
 * Generates an SVG path `d` string for coordinates, smoothly curving around waypoints.
 */
export function generateWarRouteSvgPath(points: [number, number][]): string {
  if (!points || points.length < 2) return "";
  if (points.length === 2) {
    return `M${points[0][0]},${points[0][1]} L${points[1][0]},${points[1][1]}`;
  }

  const lineGenerator = line<[number, number]>()
    .x(d => d[0])
    .y(d => d[1])
    .curve(curveCatmullRom.alpha(0.5));

  return lineGenerator(points) || "";
}
