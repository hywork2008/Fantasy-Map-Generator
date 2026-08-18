import { calculateLandTravelDays } from "../../../services/routeGrade";
import { normalizeHeightExponent } from "../../../utils/height";
import { useOptionsState } from "../../hostCore";
import { getMarkets, getWorldContext } from "../economyContext";
import { CaravanMovement, getDraftAnimalType } from "./caravanMovement";
import type { TradeRoutePoint, TradeRouteSegment } from "./marketTypes";
import { getRailwayTravelMultiplier } from "./railwayTravel";

/** Time spent loading or unloading when a route switches between land and sea. */
export const PORT_TRANSFER_PENALTY_DAYS = 2;

export interface RouteDurationOptions {
  heights?: ArrayLike<number>;
  heightExponent?: number;
  draftAnimalId?: string;
  /**
   * When true (default for deal/ETA duration), grade slows travel but pathfinding
   * avoid multipliers are not applied. Pathfinding uses TradeAnimation's edge costs instead.
   */
  forPathfinding?: boolean;
}

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

function resolveHeights(options?: RouteDurationOptions): ArrayLike<number> | null {
  if (options?.heights) return options.heights;
  try {
    return getWorldContext().pack?.cells?.h ?? null;
  } catch {
    return null;
  }
}

function resolveHeightExponent(options?: RouteDurationOptions): number {
  if (options?.heightExponent !== undefined) return normalizeHeightExponent(options.heightExponent);
  return normalizeHeightExponent(useOptionsState.getState().heightExponent);
}

function applyRailway(points: readonly TradeRoutePoint[]): number {
  if (points.length < 2) return 1;
  try {
    const burgs = getWorldContext().pack?.burgs ?? [];
    const markets = getMarkets();
    const nearest = (point: TradeRoutePoint): number => {
      let bestId = 0;
      let best = Number.POSITIVE_INFINITY;
      for (const market of markets) {
        const burg = burgs[market.centerBurgId];
        if (!burg || burg.removed) continue;
        const distance = Math.hypot(burg.x - point[0], burg.y - point[1]);
        if (distance < best) {
          best = distance;
          bestId = market.i;
        }
      }
      return bestId;
    };
    return getRailwayTravelMultiplier(nearest(points[0]), nearest(points[points.length - 1]));
  } catch {
    return 1;
  }
}

/** Land segment travel days with grade (when cells + heights available). */
export function getLandSegmentTravelDays(
  points: readonly TradeRoutePoint[],
  distanceScale: number,
  options?: RouteDurationOptions
): number {
  const movement = CaravanMovement.getOptions();
  const animal = getDraftAnimalType(options?.draftAnimalId);
  const heights = resolveHeights(options);

  if (!heights || movement.gradeEffectStrength === 0) {
    if (movement.landKmPerDay <= 0) return Infinity;
    return (
      applyRailway(points) *
      ((getSegmentDistanceMapUnits({ type: "land", points: [...points] }) * distanceScale) /
        (movement.landKmPerDay * animal.speedMultiplier))
    );
  }

  return (
    applyRailway(points) *
    calculateLandTravelDays(points, {
      distanceScale,
      heightExponent: resolveHeightExponent(options),
      heights,
      landKmPerDay: movement.landKmPerDay,
      draftSpeedMultiplier: animal.speedMultiplier,
      gradeEffectStrength: movement.gradeEffectStrength,
      sensitivity: animal.gradeSensitivity,
      // Real ETA / deal eligibility never includes avoid multipliers.
      routePreference: options?.forPathfinding ? movement.merchantRoutePreference : "preferSpeed"
    })
  );
}

export function calculateRouteDurationDays(
  segments: readonly TradeRouteSegment[],
  distanceScale: number,
  options?: RouteDurationOptions
): number {
  const movement = CaravanMovement.getOptions();
  let duration = 0;

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment.type === "land") {
      const days = getLandSegmentTravelDays(segment.points, distanceScale, options);
      if (!Number.isFinite(days)) return Infinity;
      duration += days;
    } else if (segment.type === "river") {
      if (movement.riverKmPerDay <= 0) return Infinity;
      duration += (getSegmentDistanceMapUnits(segment) * distanceScale) / movement.riverKmPerDay;
    } else {
      if (movement.seaKmPerDay <= 0) return Infinity;
      duration += (getSegmentDistanceMapUnits(segment) * distanceScale) / movement.seaKmPerDay;
    }
    if (index > 0 && segment.type !== segments[index - 1].type) duration += PORT_TRANSFER_PENALTY_DAYS;
  }

  // A caravan is progressed in whole simulation days, so a partial final day consumes a full
  // day's budget for both eligibility and its fixed maintenance cost.
  return Math.ceil(duration);
}

/**
 * Speculative / graph-distance estimate without per-edge grade samples.
 * Grade is not applied here (no cell polyline); used by opportunity scan over aggregated
 * land/sea distances. Full routes with cells use calculateRouteDurationDays instead.
 */
export function calculateRouteDurationFromDistances(
  landDistanceKm: number,
  seaDistanceKm: number,
  transferCount: number,
  riverDistanceKm: number = 0
): number {
  const movement = CaravanMovement.getOptions();
  if (
    (landDistanceKm > 0 && movement.landKmPerDay <= 0) ||
    (seaDistanceKm > 0 && movement.seaKmPerDay <= 0) ||
    (riverDistanceKm > 0 && movement.riverKmPerDay <= 0)
  )
    return Infinity;

  const duration =
    (landDistanceKm > 0 ? landDistanceKm / movement.landKmPerDay : 0) +
    (seaDistanceKm > 0 ? seaDistanceKm / movement.seaKmPerDay : 0) +
    (riverDistanceKm > 0 ? riverDistanceKm / movement.riverKmPerDay : 0) +
    Math.max(0, transferCount) * PORT_TRANSFER_PENALTY_DAYS;
  return Math.ceil(duration);
}
