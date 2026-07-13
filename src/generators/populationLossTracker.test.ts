import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulationContext } from "../context/simulationContext";
import { setSimulationTelemetry } from "../services/simulationTelemetry";
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

  afterEach(() => {
    setSimulationTelemetry(null);
    simulationContext.tickCount = 0;
    simulationContext.currentYear = 0;
    simulationContext.currentMonth = 1;
    simulationContext.currentDay = 1;
    simulationContext.era = "";
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

  it("accumulates combat deaths for overview windows", () => {
    recordDeaths(3, 250, "combat");
    recordDeaths(3, 50, "combat");
    recordDeaths(4, 10, "combat");
    const byState = getDeathsByState("week");
    expect(byState.get(3)?.combat).toBe(300);
    expect(byState.get(3)?.total).toBe(300);
    expect(byState.get(4)?.combat).toBe(10);
  });

  it("mirrors deaths to the registered telemetry with the current sim clock", () => {
    simulationContext.tickCount = 42;
    simulationContext.currentYear = 100;
    simulationContext.currentMonth = 3;
    simulationContext.currentDay = 15;
    simulationContext.era = "Era";

    const onDeath = vi.fn();
    setSimulationTelemetry({ onDeath });

    recordDeaths(1, 50, "combat");

    expect(onDeath).toHaveBeenCalledTimes(1);
    expect(onDeath).toHaveBeenCalledWith({
      tick: 42,
      cal: { y: 100, m: 3, d: 15, era: "Era" },
      stateId: 1,
      people: 50,
      cause: "combat"
    });
  });

  it("does not mirror non-positive or invalid recordDeaths calls", () => {
    const onDeath = vi.fn();
    setSimulationTelemetry({ onDeath });

    recordDeaths(0, 100, "natural");
    recordDeaths(1, 0, "combat");
    recordDeaths(1, -5, "famine");

    expect(onDeath).not.toHaveBeenCalled();
  });
});
