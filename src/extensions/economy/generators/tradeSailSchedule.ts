/**
 * Commercial sail calendar and route-dependent loading waits (Phase E / F).
 * Pure helpers — no economyContext imports. Tunable defaults come from TradeLogisticsSettings.
 *
 * @see docs/plan/merchant-logistics-warehouses.md Phase E / F
 * @see docs/plan/drop-poor-trade.md step 2 schedule notes
 */

import {
  DEFAULT_MAX_WAIT_DAYS_LAND,
  DEFAULT_MAX_WAIT_DAYS_SEA,
  DEFAULT_MIN_SAIL_UTILIZATION,
  DEFAULT_TARGET_UTILIZATION
} from "./marketFlowBudget";
import type { TradeRouteSegment } from "./marketTypes";

/** Fixed sail days within each calendar month (1-based day of month). */
export const SCHEDULED_SAIL_DAYS = [1, 10, 20] as const;

/** Lake / short coastal hops: short accumulation (docs/temp/market/memos.md). */
export const DEFAULT_MAX_WAIT_DAYS_SHORT_SEA = 2;

/** Water-only routes at or under this length (km) use the short-sea wait. */
export const SHORT_SEA_DISTANCE_KM = 120;

/** Local road consignments leave with the next available cart instead of accumulating as a ship hold. */
export const LOCAL_LAND_DISPATCH_DISTANCE_KM = 96;

export {
  DEFAULT_MAX_WAIT_DAYS_LAND,
  DEFAULT_MAX_WAIT_DAYS_SEA,
  DEFAULT_MIN_SAIL_UTILIZATION,
  DEFAULT_TARGET_UTILIZATION
};

export type SailWaitOptions = {
  maxWaitDaysLand?: number;
  maxWaitDaysSea?: number;
  maxWaitDaysShortSea?: number;
  shortSeaDistanceKm?: number;
};

export function isScheduledSailDay(dayOfMonth: number, sailDays: readonly number[] = SCHEDULED_SAIL_DAYS): boolean {
  if (!Number.isFinite(dayOfMonth)) return false;
  const day = Math.floor(dayOfMonth);
  return sailDays.includes(day);
}

/** Next calendar sail day on or after `dayOfMonth` (wraps to first sail day next month). */
export function nextScheduledSailDay(dayOfMonth: number, sailDays: readonly number[] = SCHEDULED_SAIL_DAYS): number {
  const days = sailDays.length ? [...sailDays].sort((a, b) => a - b) : [...SCHEDULED_SAIL_DAYS];
  const day = Math.max(1, Math.floor(dayOfMonth));
  for (const sailDay of days) {
    if (sailDay >= day) return sailDay;
  }
  return days[0];
}

export function daysUntilNextSailDay(dayOfMonth: number, sailDays: readonly number[] = SCHEDULED_SAIL_DAYS): number {
  const day = Math.max(1, Math.floor(dayOfMonth));
  const next = nextScheduledSailDay(day, sailDays);
  if (next >= day) return next - day;
  // Wrap: treat remaining days in a 30-day month approximation.
  return 30 - day + next;
}

export function routeHasWater(routeSegments: readonly TradeRouteSegment[]): boolean {
  return routeSegments.some(segment => segment.type === "water" || segment.type === "sea" || segment.type === "river");
}

export function routeHasLand(routeSegments: readonly TradeRouteSegment[]): boolean {
  return routeSegments.some(segment => segment.type === "land");
}

/** A short route using roads alone is served as a local cart run, not a scheduled sailing. */
export function isLocalLandRoute(routeSegments: readonly TradeRouteSegment[], distanceKm: number): boolean {
  return (
    routeHasLand(routeSegments) &&
    !routeHasWater(routeSegments) &&
    distanceKm > 0 &&
    distanceKm <= LOCAL_LAND_DISPATCH_DISTANCE_KM
  );
}

/**
 * Loading wait before a thin shipment cancels or sails overdue.
 * Water-only short hops use a short lake/coastal muster.
 */
export function maxWaitDaysForRoute(
  routeSegments: readonly TradeRouteSegment[],
  distanceKm: number,
  options: SailWaitOptions = {}
): number {
  const water = routeHasWater(routeSegments);
  const land = routeHasLand(routeSegments);
  const shortKm = options.shortSeaDistanceKm ?? SHORT_SEA_DISTANCE_KM;
  const shortWait = options.maxWaitDaysShortSea ?? DEFAULT_MAX_WAIT_DAYS_SHORT_SEA;
  const seaWait = options.maxWaitDaysSea ?? DEFAULT_MAX_WAIT_DAYS_SEA;
  const landWait = options.maxWaitDaysLand ?? DEFAULT_MAX_WAIT_DAYS_LAND;

  if (water && !land && distanceKm > 0 && distanceKm <= shortKm) {
    return shortWait;
  }
  if (water) return seaWait;
  return landWait;
}

/** Diagnostic sail / cancel reasons shown in Trade Details and Active Caravans. */
export type SailDecisionReason =
  | "depart-full"
  | "depart-local"
  | "depart-schedule"
  | "depart-overdue"
  | "waiting"
  | "cancelled-thin";

export type SailDecision = "depart" | "waiting" | "cancelled";

export function sailDecisionFromReason(reason: SailDecisionReason): SailDecision {
  if (reason.startsWith("depart-")) return "depart";
  if (reason === "cancelled-thin") return "cancelled";
  return "waiting";
}

export function formatSailDecisionReason(reason: SailDecisionReason | undefined): string {
  switch (reason) {
    case "depart-full":
      return "Full hold";
    case "depart-local":
      return "Local cart dispatch";
    case "depart-schedule":
      return "Scheduled sail day";
    case "depart-overdue":
      return "Overdue (max wait)";
    case "cancelled-thin":
      return "Cancelled (under-filled)";
    case "waiting":
      return "Loading";
    default:
      return "—";
  }
}

/**
 * Whether a loading shipment may leave now, with a diagnostic reason.
 * - Full enough: depart any day (charter when the hold is full).
 * - Min fill on a scheduled sail day: depart (regular service).
 * - Min fill after max wait: depart even off-schedule (overdue cargo).
 * - Max wait without min fill: cancel and return cargo.
 */
export function decideSailDeparture(input: {
  utilization: number;
  targetUtilization: number;
  minSailUtilization: number;
  waitedDays: number;
  maxWaitDays: number;
  dayOfMonth: number;
  sailDays?: readonly number[];
  /** Local road carriers leave as soon as cargo is ready; calendar sailings do not apply. */
  immediateDispatch?: boolean;
  unitEpsilon?: number;
}): SailDecisionReason {
  const eps = input.unitEpsilon ?? 0.000001;
  const fullEnough = input.utilization + eps >= input.targetUtilization;
  const minFill = input.utilization + eps >= input.minSailUtilization;
  const waitExpired = input.waitedDays + eps >= input.maxWaitDays;
  const sailDay = isScheduledSailDay(input.dayOfMonth, input.sailDays ?? SCHEDULED_SAIL_DAYS);

  if (input.immediateDispatch) return "depart-local";
  if (fullEnough) return "depart-full";
  if (minFill && sailDay) return "depart-schedule";
  if (minFill && waitExpired) return "depart-overdue";
  if (waitExpired && !minFill) return "cancelled-thin";
  return "waiting";
}
