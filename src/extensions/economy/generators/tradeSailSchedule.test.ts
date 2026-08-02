import { describe, expect, it } from "vitest";
import type { TradeRouteSegment } from "./marketTypes";
import {
  DEFAULT_MAX_WAIT_DAYS_LAND,
  DEFAULT_MAX_WAIT_DAYS_SEA,
  DEFAULT_MAX_WAIT_DAYS_SHORT_SEA,
  daysUntilNextSailDay,
  decideSailDeparture,
  isScheduledSailDay,
  maxWaitDaysForRoute,
  nextScheduledSailDay,
  SCHEDULED_SAIL_DAYS,
  SHORT_SEA_DISTANCE_KM
} from "./tradeSailSchedule";

const LAND: TradeRouteSegment[] = [
  {
    type: "land",
    points: [
      [0, 0],
      [1, 0]
    ]
  }
];
const SEA: TradeRouteSegment[] = [
  {
    type: "sea",
    points: [
      [0, 0],
      [1, 0]
    ]
  }
];
const MIXED: TradeRouteSegment[] = [
  {
    type: "land",
    points: [
      [0, 0],
      [1, 0]
    ]
  },
  {
    type: "sea",
    points: [
      [1, 0],
      [2, 0]
    ]
  }
];

describe("trade sail schedule", () => {
  it("recognizes fixed sail days of the month", () => {
    for (const day of SCHEDULED_SAIL_DAYS) {
      expect(isScheduledSailDay(day)).toBe(true);
    }
    expect(isScheduledSailDay(5)).toBe(false);
    expect(isScheduledSailDay(15)).toBe(false);
  });

  it("finds the next sail day and days until it", () => {
    expect(nextScheduledSailDay(1)).toBe(1);
    expect(nextScheduledSailDay(2)).toBe(10);
    expect(nextScheduledSailDay(11)).toBe(20);
    expect(nextScheduledSailDay(21)).toBe(1);
    expect(daysUntilNextSailDay(1)).toBe(0);
    expect(daysUntilNextSailDay(5)).toBe(5);
    expect(daysUntilNextSailDay(25)).toBe(6); // 30-day wrap approximation
  });

  it("uses short wait for water-only short hops", () => {
    expect(maxWaitDaysForRoute(SEA, SHORT_SEA_DISTANCE_KM)).toBe(DEFAULT_MAX_WAIT_DAYS_SHORT_SEA);
    expect(maxWaitDaysForRoute(SEA, SHORT_SEA_DISTANCE_KM + 1)).toBe(DEFAULT_MAX_WAIT_DAYS_SEA);
    expect(maxWaitDaysForRoute(LAND, 50)).toBe(DEFAULT_MAX_WAIT_DAYS_LAND);
    expect(maxWaitDaysForRoute(MIXED, 50)).toBe(DEFAULT_MAX_WAIT_DAYS_SEA);
  });

  it("departs when full regardless of calendar day", () => {
    expect(
      decideSailDeparture({
        utilization: 0.6,
        targetUtilization: 0.55,
        minSailUtilization: 0.2,
        waitedDays: 0,
        maxWaitDays: 10,
        dayOfMonth: 5
      })
    ).toBe("depart");
  });

  it("departs thin-but-viable cargo on sail days or when overdue", () => {
    expect(
      decideSailDeparture({
        utilization: 0.25,
        targetUtilization: 0.55,
        minSailUtilization: 0.2,
        waitedDays: 1,
        maxWaitDays: 10,
        dayOfMonth: 10
      })
    ).toBe("depart");

    expect(
      decideSailDeparture({
        utilization: 0.25,
        targetUtilization: 0.55,
        minSailUtilization: 0.2,
        waitedDays: 1,
        maxWaitDays: 10,
        dayOfMonth: 5
      })
    ).toBe("waiting");

    expect(
      decideSailDeparture({
        utilization: 0.25,
        targetUtilization: 0.55,
        minSailUtilization: 0.2,
        waitedDays: 10,
        maxWaitDays: 10,
        dayOfMonth: 5
      })
    ).toBe("depart");
  });

  it("cancels after max wait when utilization stays below the min sail floor", () => {
    expect(
      decideSailDeparture({
        utilization: 0.05,
        targetUtilization: 0.55,
        minSailUtilization: 0.2,
        waitedDays: 14,
        maxWaitDays: 14,
        dayOfMonth: 1
      })
    ).toBe("cancelled");
  });
});
