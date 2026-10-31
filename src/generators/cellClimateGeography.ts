import type { WorldContext } from "../context/worldContext";
import { EARTH_EQUATORIAL_CIRCUMFERENCE_KM, getEarthCoordinatesAtMapPoint } from "../data/earthConfig";
import { pow } from "../simulation/deterministicMath";

export type ContinentalitySource = "mappedCoast" | "regionalFallback";
export interface Geography {
  key: string;
  continentality: Float32Array;
  source: ContinentalitySource[];
}
const RADIUS = EARTH_EQUATORIAL_CIRCUMFERENCE_KM / (2 * Math.PI);
type Vector = [number, number, number];
interface Node {
  point: Vector;
  axis: number;
  left?: Node;
  right?: Node;
}
function vector(latitude: number, longitude: number): Vector {
  const lat = (latitude * Math.PI) / 180;
  const lon = (longitude * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}
function tree(points: Vector[], depth = 0): Node | undefined {
  if (!points.length) return undefined;
  const axis = depth % 3;
  points.sort((a, b) => a[axis] - b[axis]);
  const mid = Math.floor(points.length / 2);
  return {
    point: points[mid],
    axis,
    left: tree(points.slice(0, mid), depth + 1),
    right: tree(points.slice(mid + 1), depth + 1)
  };
}
function nearest(node: Node | undefined, target: Vector, best = Infinity): number {
  if (!node) return best;
  const distance = node.point.reduce((sum, value, axis) => sum + pow(value - target[axis], 2), 0);
  best = Math.min(best, distance);
  const delta = target[node.axis] - node.point[node.axis];
  best = nearest(delta < 0 ? node.left : node.right, target, best);
  if (delta * delta < best) best = nearest(delta < 0 ? node.right : node.left, target, best);
  return best;
}
/** Content hash catches in-place edits as well as replacement arrays; geography is rebuilt only on geographical changes. */
const hashBuffer = new DataView(new ArrayBuffer(8));
export function hash(values: ArrayLike<number> | undefined, initial = 2166136261): number {
  let result = initial;
  if (!values) return result;
  for (let i = 0; i < values.length; i++) {
    hashBuffer.setFloat64(0, values[i], true);
    result = Math.imul(result ^ hashBuffer.getUint32(0, true), 16777619);
    result = Math.imul(result ^ hashBuffer.getUint32(4, true), 16777619);
  }
  return Math.imul(result ^ values.length, 16777619) >>> 0;
}
export function geographyKey(world: WorldContext): string {
  const { grid, mapCoordinates, graphHeight, graphWidth } = world;
  let pointHash = 2166136261;
  for (const point of grid.points) pointHash = hash(point, pointHash);
  let topologyHash = 2166136261;
  for (const neighbors of grid.cells.c ?? []) topologyHash = hash(neighbors, topologyHash);
  return JSON.stringify([
    world.mapId,
    graphWidth,
    graphHeight,
    mapCoordinates,
    pointHash,
    topologyHash,
    hash(grid.cells.h),
    hash(grid.cells.f),
    grid.features?.map(f => f?.type),
    grid.spacing,
    grid.cellsX,
    grid.cellsY
  ]);
}
/** Conservative lower bound on distance to unknown territory. Regional edges never become coastline. */
function boundaryDistance(world: WorldContext, latitude: number, longitude: number): number {
  const { latN = 0, latT = 0, lonW = 0, lonT = 0 } = world.mapCoordinates;
  const latS = latN - latT;
  const bounds: number[] = [];
  if (latN < 90) bounds.push(((Math.abs(latN - latitude) * Math.PI) / 180) * RADIUS);
  if (latS > -90) bounds.push(((Math.abs(latitude - latS) * Math.PI) / 180) * RADIUS);
  if (lonT < 359.999) {
    // Distance to the meridian's entire great circle is a lower bound for its finite segment.
    for (const edge of [lonW, lonW + lonT]) {
      bounds.push(
        RADIUS *
          Math.asin(
            Math.min(1, Math.abs(Math.cos((latitude * Math.PI) / 180) * Math.sin(((longitude - edge) * Math.PI) / 180)))
          )
      );
    }
  }
  return bounds.length ? Math.min(...bounds) : Infinity;
}
function buildGeography(world: WorldContext, key: string): Geography {
  const { grid } = world;
  const count = grid.cells.i.length;
  const continentality = new Float32Array(count).fill(0.5);
  const source: ContinentalitySource[] = Array.from({ length: count }, () => "regionalFallback");
  if (!grid.cells.h || !grid.cells.f || !grid.cells.c || !grid.features?.length) return { key, continentality, source };
  const coasts: Vector[] = [];
  const isOcean = (cell: number) => grid.features?.[grid.cells.f?.[cell]]?.type === "ocean";
  // Coast samples are edge midpoints, never inland lakes or arbitrary map edges.
  for (const cell of grid.cells.i) {
    if (grid.cells.h?.[cell] < 20) continue;
    for (const neighbor of climateNeighbors(world, cell)) {
      if (!isOcean(neighbor)) continue;
      const a = getEarthCoordinatesAtMapPoint(world, grid.points[cell]);
      const b = getEarthCoordinatesAtMapPoint(world, grid.points[neighbor]);
      if (!a || !b) continue;
      const va = vector(a.latitude, a.longitude);
      const vb = vector(b.latitude, b.longitude);
      const midpoint = va.map((value, axis) => value + vb[axis]) as Vector;
      const length = Math.hypot(...midpoint);
      if (length > 0) coasts.push(midpoint.map(value => value / length) as Vector);
    }
  }
  const root = tree(coasts);
  for (const cell of grid.cells.i) {
    const coordinates = getEarthCoordinatesAtMapPoint(world, grid.points[cell]);
    if (!coordinates) continue;
    if (isOcean(cell)) {
      continentality[cell] = 0;
      source[cell] = "mappedCoast";
      continue;
    }
    if (!root) continue;
    const squaredChord = nearest(root, vector(coordinates.latitude, coordinates.longitude));
    const distance = 2 * RADIUS * Math.asin(Math.min(1, Math.sqrt(squaredChord) / 2));
    if (distance > boundaryDistance(world, coordinates.latitude, coordinates.longitude)) continue;
    continentality[cell] = 1 - Math.exp(-distance / 300);
    source[cell] = "mappedCoast";
  }
  return { key, continentality, source };
}

const geographyCache = new WeakMap<WorldContext, Geography>();
/** Year-independent continentality, shared with consumers (wind) that must not evict the yearly climate cache. */
export function ensureClimateGeography(world: WorldContext, key = geographyKey(world)): Geography {
  const cached = geographyCache.get(world);
  if (cached?.key === key) return cached;
  const geography = buildGeography(world, key);
  geographyCache.set(world, geography);
  return geography;
}

/** Only a full-longitude map connects its seam; regional map edges remain unknown. */
export function climateDeltaX(world: WorldContext, dx: number): number {
  return (world.mapCoordinates.lonT ?? 0) >= 359.999 && world.graphWidth > 0
    ? dx - Math.round(dx / world.graphWidth) * world.graphWidth
    : dx;
}
export function climateNeighbors(world: WorldContext, cell: number): readonly number[] {
  const grid = world.grid;
  const neighbors = grid.cells.c?.[cell] ?? [];
  if (
    (world.mapCoordinates.lonT ?? 0) < 359.999 ||
    !(grid.cellsX > 1) ||
    grid.cellsX * grid.cellsY !== grid.cells.i.length
  )
    return neighbors;
  const x = cell % grid.cellsX;
  if (x !== 0 && x !== grid.cellsX - 1) return neighbors;
  const across = x === 0 ? cell + grid.cellsX - 1 : cell - grid.cellsX + 1;
  return neighbors.includes(across) ? neighbors : [...neighbors, across];
}
