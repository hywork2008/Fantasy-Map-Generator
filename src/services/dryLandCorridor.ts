import type { PhysicalWaterIndex } from "./physicalWaterIndex";
import type { RiverPoint } from "./riverGeometry";
import { validWaterPolygon } from "./riverPhysicalGeometry";

export type DryLandSegmentResult =
  | { lengthMeters: number; tangent: RiverPoint; footprint: readonly RiverPoint[] }
  | { reason: "invalid-segment" | "water-intersection" | "unsupported-terrain" };
/** A finite straight land edge with road width and conservative square end caps.
 * Cell IDs do not grant permission to cross water. A sequence of valid edges still
 * needs turn/curvature and junction validation before becoming an approach corridor.
 */
export function checkDryLandSegment(input: {
  start: RiverPoint;
  end: RiverPoint;
  widthMeters: number;
  water: PhysicalWaterIndex;
  supportsDryFootprint: (footprint: readonly RiverPoint[]) => boolean;
}): DryLandSegmentResult {
  const { start, end, widthMeters } = input;
  const dx = end[0] - start[0],
    dy = end[1] - start[1],
    length = Math.hypot(dx, dy);
  if (![...start, ...end, widthMeters, length].every(Number.isFinite) || widthMeters <= 0 || length <= 0)
    return { reason: "invalid-segment" };
  const tangent: RiverPoint = [dx / length, dy / length],
    normal: RiverPoint = [-tangent[1], tangent[0]];
  const half = widthMeters / 2;
  const footprint: RiverPoint[] = [
    [-half, -half],
    [length + half, -half],
    [length + half, half],
    [-half, half]
  ].map(([s, n]) => [start[0] + s * tangent[0] + n * normal[0], start[1] + s * tangent[1] + n * normal[1]]);
  if (!validWaterPolygon({ id: -1, rings: [footprint] })) return { reason: "invalid-segment" };
  if (input.water.touchesWater(footprint)) return { reason: "water-intersection" };
  if (!input.supportsDryFootprint(footprint)) return { reason: "unsupported-terrain" };
  return { lengthMeters: length, tangent, footprint };
}
