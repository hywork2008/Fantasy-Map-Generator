import { corridorDelta, corridorUnit } from "./approachCorridorGeometry";
import type { RiverPoint } from "./riverGeometry";
import { validWaterPolygon } from "./riverPhysicalGeometry";
/** Complete finite E→E occupied rectangle, including water and dry bridge seats.
 * Conservative square caps are included for footprint-wide jurisdiction/allowed
 * region evaluation. This polygon is NOT a dry-terrain check or rendered geometry.
 */
export function bridgePassageFootprint(
  start: RiverPoint,
  end: RiverPoint,
  widthMeters: number
): readonly RiverPoint[] | null {
  const d = corridorDelta(end, start),
    t = corridorUnit(d),
    length = Math.hypot(...d),
    half = widthMeters / 2;
  if (!t || !Number.isFinite(widthMeters) || widthMeters <= 0 || !Number.isFinite(length)) return null;
  const n: RiverPoint = [-t[1], t[0]];
  const footprint: RiverPoint[] = [
    [-half, -half],
    [length + half, -half],
    [length + half, half],
    [-half, half]
  ].map(([s, v]) => [start[0] + s * t[0] + v * n[0], start[1] + s * t[1] + v * n[1]]);
  return validWaterPolygon({ id: -1, rings: [footprint] }) ? footprint : null;
}
