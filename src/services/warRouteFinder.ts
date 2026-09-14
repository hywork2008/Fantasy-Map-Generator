import { curveCatmullRom, line } from "d3";
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
    // Try chartered sea routes first
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
