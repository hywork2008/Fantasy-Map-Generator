import { describe, expect, it } from "vitest";
import { getSeaConditionMultiplier, type OceanCurrentSample } from "./caravanMovement";

describe("getSeaConditionMultiplier", () => {
  it("has no effect when strength is 0, real current or not (opt-in gate)", () => {
    const following: OceanCurrentSample = { angleDeg: 0, speed: 255 };
    expect(getSeaConditionMultiplier([0, 0], [100, 0], 7, 0, following)).toBe(1);
    expect(getSeaConditionMultiplier([0, 0], [100, 0], 7, 0)).toBe(1);
  });

  it("real per-cell current: a fully following current gives the maximum favorable swing", () => {
    const following: OceanCurrentSample = { angleDeg: 0, speed: 255 }; // due east, full speed
    const multiplier = getSeaConditionMultiplier([0, 0], [100, 0], 7, 0.3, following);
    expect(multiplier).toBeCloseTo(1.3, 5);
  });

  it("real per-cell current: a fully opposing current gives the maximum unfavorable swing", () => {
    const against: OceanCurrentSample = { angleDeg: 180, speed: 255 }; // due west, full speed
    const multiplier = getSeaConditionMultiplier([0, 0], [100, 0], 7, 0.3, against);
    expect(multiplier).toBeCloseTo(0.7, 5);
  });

  it("real per-cell current: a purely perpendicular current has no effect", () => {
    const crosswind: OceanCurrentSample = { angleDeg: 90, speed: 255 }; // due south, travel is due east
    const multiplier = getSeaConditionMultiplier([0, 0], [100, 0], 7, 0.3, crosswind);
    expect(multiplier).toBeCloseTo(1, 5);
  });

  it("real per-cell current overrides the seasonal fallback even when the season disagrees", () => {
    // January: getCurrentDirection favors WEST (seasonUtils.test.ts), so a seasonal-only read
    // would penalize this eastbound leg. A strong real eastward current should win instead.
    const followingEast: OceanCurrentSample = { angleDeg: 0, speed: 255 };
    const multiplier = getSeaConditionMultiplier([0, 0], [100, 0], 1, 0.3, followingEast);
    expect(multiplier).toBeGreaterThan(1);
  });

  it("falls back to the seasonal east/west bias when no current sample is given", () => {
    const julyFavorable = getSeaConditionMultiplier([0, 0], [100, 0], 7, 0.3);
    const januaryUnfavorable = getSeaConditionMultiplier([0, 0], [100, 0], 1, 0.3);
    expect(julyFavorable).toBeGreaterThan(januaryUnfavorable);
  });

  it("falls back to the seasonal bias when the current sample is calm (speed 0)", () => {
    const calm: OceanCurrentSample = { angleDeg: 0, speed: 0 };
    const julyWithCalmSample = getSeaConditionMultiplier([0, 0], [100, 0], 7, 0.3, calm);
    const julyNoSample = getSeaConditionMultiplier([0, 0], [100, 0], 7, 0.3);
    expect(julyWithCalmSample).toBe(julyNoSample);
  });
});
