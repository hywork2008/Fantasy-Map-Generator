import { CaravanMovement } from "./caravanMovement";
import type { TradeRouteSegment } from "./marketTypes";

/** Time spent loading or unloading when a route switches between land and sea. */
export const PORT_TRANSFER_PENALTY_DAYS = 2;

function getSegmentDistanceMapUnits(segment: TradeRouteSegment): number {
  let distance = 0;
  for (let index = 0; index < segment.points.length - 1; index++) {
    const [x1, y1] = segment.points[index];
    const [x2, y2] = segment.points[index + 1];
    distance += Math.hypot(x2 - x1, y2 - y1);
  }
  return distance;
}

export function getRouteDistanceMapUnits(segments: readonly TradeRouteSegment[]): number {
  return segments.reduce((distance, segment) => distance + getSegmentDistanceMapUnits(segment), 0);
}

export function getRouteDistanceKm(segments: readonly TradeRouteSegment[], distanceScale: number): number {
  return getRouteDistanceMapUnits(segments) * distanceScale;
}

export function calculateRouteDurationDays(segments: readonly TradeRouteSegment[], distanceScale: number): number {
  const movement = CaravanMovement.getOptions();
  let duration = 0;

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const speed = segment.type === "land" ? movement.landKmPerDay : movement.seaKmPerDay;
    if (speed <= 0) return Infinity;

    duration += (getSegmentDistanceMapUnits(segment) * distanceScale) / speed;
    if (index > 0 && segment.type !== segments[index - 1].type) duration += PORT_TRANSFER_PENALTY_DAYS;
  }

  // A caravan is progressed in whole simulation days, so a partial final day consumes a full
  // day's budget for both eligibility and its fixed maintenance cost.
  return Math.ceil(duration);
}

export function calculateRouteDurationFromDistances(
  landDistanceKm: number,
  seaDistanceKm: number,
  transferCount: number
): number {
  const movement = CaravanMovement.getOptions();
  if (movement.landKmPerDay <= 0 || movement.seaKmPerDay <= 0) return Infinity;

  const duration =
    landDistanceKm / movement.landKmPerDay +
    seaDistanceKm / movement.seaKmPerDay +
    Math.max(0, transferCount) * PORT_TRANSFER_PENALTY_DAYS;
  return Math.ceil(duration);
}
