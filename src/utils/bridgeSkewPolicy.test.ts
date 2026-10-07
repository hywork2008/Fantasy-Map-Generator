import { describe, expect, it } from "vitest";
import {
  bridgeSkewDegrees,
  bridgeSkewLimitForPeriod,
  resolveBridgeSkewLimit,
  withinBridgeSkewLimit
} from "./bridgeSkewPolicy";

describe("bridge skew policy", () => {
  it("raises the allowance by era: medieval stone 15°/timber 20°, early modern 25°, skew-arch age 30°", () => {
    expect(bridgeSkewLimitForPeriod("earlyMedieval")).toBe(15);
    expect(bridgeSkewLimitForPeriod("lateMedieval", "timber")).toBe(20);
    expect(bridgeSkewLimitForPeriod("ageOfExploration")).toBe(25);
    expect(bridgeSkewLimitForPeriod("maritimeEra")).toBe(25);
    expect(bridgeSkewLimitForPeriod("preIndustrialEra")).toBe(30);
    expect(bridgeSkewLimitForPeriod("rocketryEra")).toBe(30);
    expect(bridgeSkewLimitForPeriod(undefined)).toBe(15);
    expect(bridgeSkewLimitForPeriod("unknown")).toBe(15);
  });

  it("prefers an explicit state allowance exported by FMG", () => {
    expect(resolveBridgeSkewLimit("earlyMedieval", { maxBridgeSkewDegrees: 30 })).toBe(30);
    expect(resolveBridgeSkewLimit("steamEra", {})).toBe(30);
    expect(resolveBridgeSkewLimit("steamEra", { maxBridgeSkewDegrees: Number.NaN })).toBe(30);
  });

  it("measures the angle from the river normal, independent of direction and length", () => {
    expect(bridgeSkewDegrees([0, 5], [1, 0])).toBeCloseTo(0);
    expect(bridgeSkewDegrees([0, -1], [-3, 0])).toBeCloseTo(0);
    expect(bridgeSkewDegrees([1, 0], [1, 0])).toBeCloseTo(90);
    const thirty = (30 * Math.PI) / 180;
    expect(bridgeSkewDegrees([Math.sin(thirty), Math.cos(thirty)], [1, 0])).toBeCloseTo(30);
    expect(withinBridgeSkewLimit(15, 15)).toBe(true);
    expect(withinBridgeSkewLimit(15.1, 15)).toBe(false);
  });
});
