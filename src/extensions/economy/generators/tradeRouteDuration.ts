import { calculateLandTravelDays } from "../../../services/routeGrade";
import { normalizeHeightExponent } from "../../../utils/height";
import { useOptionsState } from "../../hostCore";
import { getMarkets, getRailwayLinks, getWorldContext } from "../economyContext";
import { CaravanMovement, getDraftAnimalType } from "./caravanMovement";
import type { TradeRoutePoint, TradeRouteSegment } from "./marketTypes";
import { getRailwayTravelMultiplier } from "./railwayTravel";

/** Time spent loading or unloading when a route switches between land and sea. */
export const PORT_TRANSFER_PENALTY_DAYS = 2;

/**
 * Speed a fully unpaved land leg loses against metalled track (docs/plan/economy-coupling-audit.md
 * L8 stage 2). Before this, `Route.group` had no runtime effect on trade at all — generation-time
 * `Routes.getConnectivityRate` and map styling were its only readers — so promoting a trail to a
 * road would have been a purely cosmetic use of the Public Works budget.
 *
 * Framed as a penalty on trails rather than a bonus on roads deliberately: most inter-burg trade
 * already runs over generated `roads`, so a bonus would have made land trade across every existing
 * map ~25% faster overnight and invalidated the current calibration. This way paved travel keeps
 * exactly the speed it had, and only the trails a state has not yet paved are slower.
 */
export const UNPAVED_ROAD_SPEED_PENALTY = 0.2;

/**
 * Travel-speed multiplier for a land segment that is `pavedShare` (0..1) on `roads`/`railways`
 * track: 1 when fully paved, `1 − UNPAVED_ROAD_SPEED_PENALTY` on a bare trail. An unknown share
 * (segments planned before L8 stage 2, and wilderness paths that follow no route at all) keeps
 * the pre-change speed rather than being penalised on a guess.
 */
export function getSurfaceSpeedMultiplier(pavedShare: number | undefined): number {
  if (pavedShare === undefined) return 1;
  return 1 - UNPAVED_ROAD_SPEED_PENALTY * (1 - Math.max(0, Math.min(1, pavedShare)));
}

/**
 * Share of the mode-transfer penalty a fully built-out harbour (`Burg.publicWorks.harbor` = 1)
 * removes. Quays, cranes and a dredged basin let a hull be worked alongside instead of lightered
 * ashore — the Public Works budget's port line (docs/plan/economy-coupling-audit.md L8 stage 2).
 */
export const HARBOR_WORKS_MAX_TRANSFER_SAVING = 0.5;

/**
 * Days lost changing between land and water at `cellId`. Falls back to the flat
 * PORT_TRANSFER_PENALTY_DAYS whenever the transfer point is unknown, carries no burg, or that
 * burg has no harbour works yet — so a map that has never funded Public Works behaves exactly
 * as it did before.
 */
export function getPortTransferPenaltyDays(cellId: number | undefined): number {
  if (cellId === undefined) return PORT_TRANSFER_PENALTY_DAYS;
  let harbor = 0;
  try {
    const pack = getWorldContext().pack;
    const burgId = pack?.cells?.burg?.[cellId];
    harbor = (burgId && pack.burgs?.[burgId]?.publicWorks?.harbor) || 0;
  } catch {
    return PORT_TRANSFER_PENALTY_DAYS;
  }
  if (!(harbor > 0)) return PORT_TRANSFER_PENALTY_DAYS;
  return PORT_TRANSFER_PENALTY_DAYS * (1 - HARBOR_WORKS_MAX_TRANSFER_SAVING * Math.min(1, harbor));
}

/** Cell id a segment boundary sits on, when the polyline carries one. */
function getSegmentStartCell(segment: TradeRouteSegment): number | undefined {
  const point = segment.points[0];
  return point && point.length > 2 ? point[2] : undefined;
}

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
  // The nearest-market lookup below is O(markets) per endpoint and this function runs on
  // nearly every land-segment duration calculation in the economy extension (caravans, retail
  // restocking, strategic procurement, trade-opportunity scanning, escort jobs, market
  // generation, player travel). Skip it while no state has finished any railway link yet —
  // railwayOperations requires demonstrated Coke -> Steel -> Machine Parts -> Steam Engine ->
  // steamTransport -> railEngineering first, so this covers the overwhelming majority of any
  // playthrough (see docs/plan/steam-industrial-implementation.md §7).
  if (getRailwayLinks().length === 0) return 1;
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
      duration += days / getSurfaceSpeedMultiplier(segment.pavedShare);
    } else if (segment.type === "river") {
      if (movement.riverKmPerDay <= 0) return Infinity;
      duration += (getSegmentDistanceMapUnits(segment) * distanceScale) / movement.riverKmPerDay;
    } else {
      if (movement.seaKmPerDay <= 0) return Infinity;
      duration += (getSegmentDistanceMapUnits(segment) * distanceScale) / movement.seaKmPerDay;
    }
    if (index > 0 && segment.type !== segments[index - 1].type) {
      duration += getPortTransferPenaltyDays(getSegmentStartCell(segment));
    }
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
