import { beforeEach, describe, expect, it } from "vitest";
import {
  advancePopulationLossClock,
  getDeathsByState,
  recordDeaths,
  resetPopulationLossTracker
} from "./populationLossTracker";

describe("populationLossTracker", () => {
  beforeEach(() => {
    resetPopulationLossTracker();
  });

  it("sums deaths within a 1-day window", () => {
    recordDeaths(1, 100, "natural");
    recordDeaths(1, 50, "combat");
    recordDeaths(2, 20, "famine");
    const byState = getDeathsByState("day");
    expect(byState.get(1)?.total).toBe(150);
    expect(byState.get(1)?.combat).toBe(50);
    expect(byState.get(2)?.famine).toBe(20);
  });

  it("excludes deaths older than the week window", () => {
    recordDeaths(1, 1000, "natural");
    advancePopulationLossClock(10);
    recordDeaths(1, 5, "combat");
    const week = getDeathsByState("week");
    // day 0 bucket is outside last 7 days after clock at 10
    expect(week.get(1)?.total).toBe(5);
    expect(week.get(1)?.combat).toBe(5);
  });

  it("ignores non-positive amounts and invalid state ids", () => {
    recordDeaths(0, 100, "natural");
    recordDeaths(1, 0, "combat");
    recordDeaths(1, -5, "famine");
    expect(getDeathsByState("month").size).toBe(0);
  });
});
