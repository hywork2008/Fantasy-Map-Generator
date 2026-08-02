/**
 * Commercial sail calendar and route-dependent loading waits (Phase E).
 * Pure helpers — no economyContext imports.
 *
 * @see docs/plan/merchant-logistics-warehouses.md Phase E
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

export {
  DEFAULT_MAX_WAIT_DAYS_LAND,
  DEFAULT_MAX_WAIT_DAYS_SEA,
  DEFAULT_MIN_SAIL_UTILIZATION,
  DEFAULT_TARGET_UTILIZATION
};

export function isScheduledSailDay(dayOfMonth: number): boolean {
  if (!Number.isFinite(dayOfMonth)) return false;
  const day = Math.floor(dayOfMonth);
  return (SCHEDULED_SAIL_DAYS as readonly number[]).includes(day);
}

/** Next calendar sail day on or after `dayOfMonth` (wraps to 1 next month conceptually). */
export function nextScheduledSailDay(dayOfMonth: number): number {
  const day = Math.max(1, Math.floor(dayOfMonth));
  for (const sailDay of SCHEDULED_SAIL_DAYS) {
    if (sailDay >= day) return sailDay;
  }
  return SCHEDULED_SAIL_DAYS[0];
}

export function daysUntilNextSailDay(dayOfMonth: number): number {
  const day = Math.max(1, Math.floor(dayOfMonth));
  const next = nextScheduledSailDay(day);
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

/**
 * Loading wait before a thin shipment cancels or sails overdue.
 * Water-only short hops use a 1–2 day lake/coastal muster.
 */
export function maxWaitDaysForRoute(routeSegments: readonly TradeRouteSegment[], distanceKm: number): number {
  const water = routeHasWater(routeSegments);
  const land = routeHasLand(routeSegments);
  if (water && !land && distanceKm > 0 && distanceKm <= SHORT_SEA_DISTANCE_KM) {
    return DEFAULT_MAX_WAIT_DAYS_SHORT_SEA;
  }
  if (water) return DEFAULT_MAX_WAIT_DAYS_SEA;
  return DEFAULT_MAX_WAIT_DAYS_LAND;
}

export type SailDecision = "depart" | "waiting" | "cancelled";

/**
 * Whether a loading shipment may leave now.
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
  unitEpsilon?: number;
}): SailDecision {
  const eps = input.unitEpsilon ?? 0.000001;
  const fullEnough = input.utilization + eps >= input.targetUtilization;
  const minFill = input.utilization + eps >= input.minSailUtilization;
  const waitExpired = input.waitedDays + eps >= input.maxWaitDays;
  const sailDay = isScheduledSailDay(input.dayOfMonth);

  if (fullEnough) return "depart";
  if (minFill && (sailDay || waitExpired)) return "depart";
  if (waitExpired && !minFill) return "cancelled";
  return "waiting";
}
