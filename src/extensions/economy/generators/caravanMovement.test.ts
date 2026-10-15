import { describe, expect, it } from "vitest";
import { getSeaConditionMultiplier, getSeaWindMultiplier, type OceanCurrentSample } from "./caravanMovement";

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

describe("getSeaWindMultiplier (W3 sensitivity)", () => {
  // Map points: x east, y south. Leg due east.
  const from: [number, number] = [0, 0];
  const east: [number, number] = [100, 0];
  it("speeds tailwind legs, slows headwind legs, ignores a pure crosswind", () => {
    expect(getSeaWindMultiplier(from, east, 1, { u: 8, v: 0 })).toBeCloseTo(1.5, 9);
    expect(getSeaWindMultiplier(from, east, 1, { u: -8, v: 0 })).toBeCloseTo(0.5, 9);
    expect(getSeaWindMultiplier(from, east, 1, { u: 0, v: 8 })).toBeCloseTo(1, 9);
    expect(getSeaWindMultiplier(from, east, 0.5, { u: 4, v: 0 })).toBeCloseTo(1.125, 9);
  });
  it("reads northward legs against map y growing south", () => {
    expect(getSeaWindMultiplier([0, 100], [0, 0], 1, { u: 0, v: 8 })).toBeCloseTo(1.5, 9);
  });
  it("has no effect without a sample or at strength 0", () => {
    expect(getSeaWindMultiplier(from, east, 1, null)).toBe(1);
    expect(getSeaWindMultiplier(from, east, 0, { u: 8, v: 0 })).toBe(1);
  });
});
