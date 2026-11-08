import type { Point } from "../../../types/primitives";
import type { VectorFabric, VectorFabricCell } from "../../../types/vector/fabric";
import { pointInPolygon, polygonArea } from "../../geom";
import { cellHouseCount, cellHouseRing, fabricHouseId, unpackPoints } from "./pack";

/** A detached house's entrance connector must end this close to its fabric street or lane. */
export const FABRIC_ENTRANCE_TOLERANCE_METERS = 0.02;

/** Parses `<cell id>#<index>`. Cell ids themselves never contain `#`. */
export function parseFabricHouseId(id: string): { cellId: string; index: number } | undefined {
  const at = id.lastIndexOf("#");
  if (at <= 0) return undefined;
  const index = Number(id.slice(at + 1));
  return Number.isInteger(index) && index >= 0 && String(index) === id.slice(at + 1)
    ? { cellId: id.slice(0, at), index }
    : undefined;
}

export interface VectorFabricHouseInfo {
  id: string;
  cellId: string;
  districtId: string;
  ring: Point[];
  areaMeters2: number;
  storeys: number;
  dwellings: number;
  entrance: Point;
  accessPoint: Point;
  insideWall: boolean;
}

/** Derived values per house, keyed by the cell hash so an unchanged record is never decoded twice. */
const infoCache = new Map<string, VectorFabricHouseInfo>();
const INFO_CACHE_LIMIT = 4096;

/** The generated house `id`, or undefined when it does not exist or was detached to a placement. */
export function fabricHouseInfo(
  fabric: Readonly<VectorFabric> | undefined,
  id: string
): VectorFabricHouseInfo | undefined {
  const ref = parseFabricHouseId(id),
    cell = ref && fabric && Object.hasOwn(fabric.cells, ref.cellId) ? fabric.cells[ref.cellId] : undefined;
  if (!ref || !cell || ref.index >= cellHouseCount(cell) || cell.detached.includes(ref.index)) return undefined;
  const key = `${cell.hash}#${ref.index}`,
    cached = infoCache.get(key);
  if (cached) return cached;
  const ring = cellHouseRing(cell, ref.index),
    [entrance, accessPoint] = unpackPoints(cell.houses.entrances, cell.origin, 2 * ref.index, 2 * ref.index + 2);
  const info: VectorFabricHouseInfo = {
    id,
    cellId: cell.id,
    districtId: cell.districtId,
    ring,
    areaMeters2: Math.abs(polygonArea(ring)),
    storeys: cell.houses.storeys[ref.index],
    dwellings: cell.houses.dwellings[ref.index],
    entrance,
    accessPoint,
    insideWall: !!cell.inside
  };
  if (infoCache.size >= INFO_CACHE_LIMIT) infoCache.clear();
  infoCache.set(key, info);
  return info;
}

/** The house of `cell` under `point`, decoding only that cell. */
export function fabricHouseInCell(cell: Readonly<VectorFabricCell>, point: Point): string | undefined {
  const detached = new Set(cell.detached);
  for (let i = 0; i < cellHouseCount(cell); i++)
    if (!detached.has(i) && pointInPolygon(point, cellHouseRing(cell, i))) return fabricHouseId(cell.id, i);
  return undefined;
}
