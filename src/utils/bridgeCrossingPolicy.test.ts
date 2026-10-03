import { describe, expect, it } from "vitest";
import { bridgeCrossingLimitForPeriod, resolveBridgeCrossingLimit } from "./bridgeCrossingPolicy";

describe("supported bridge crossings", () => {
  it("allows a 97m medieval river but excludes a 12km routine bridge in every era", () => {
    for (const period of [
      "classicalAntiquity",
      "earlyMedieval",
      "highMedieval",
      "lateMedieval",
      "ageOfExploration",
      "maritimeEra",
      "preIndustrialEra",
      "steamEra",
      "industrialChemistryEra",
      "petroleumEra",
      "rocketryEra"
    ]) {
      expect(bridgeCrossingLimitForPeriod(period)).toBeGreaterThanOrEqual(97);
      expect(bridgeCrossingLimitForPeriod(period)).toBeLessThan(12000);
    }
  });
  it("migrates obsolete generated caps while retaining deliberate overrides", () => {
    expect(resolveBridgeCrossingLimit("ageOfExploration", { maxBridgeSpanMeters: 50 })).toBe(1000);
    expect(resolveBridgeCrossingLimit("steamEra", { maxBridgeSpanMeters: 1000 })).toBe(2500);
    expect(resolveBridgeCrossingLimit("ageOfExploration", { maxBridgeSpanMeters: 80 })).toBe(80);
    expect(resolveBridgeCrossingLimit("ageOfExploration", { maxBridgeCrossingMeters: 50 })).toBe(50);
    expect(resolveBridgeCrossingLimit("rocketryEra", { maxBridgeCrossingMeters: NaN })).toBe(5000);
    expect(resolveBridgeCrossingLimit("unknown")).toBe(300);
  });
});
