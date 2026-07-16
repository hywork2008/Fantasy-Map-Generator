import { describe, expect, it } from "vitest";
import { getNightscapeBeamPose, getNightscapePopulationGlow, NIGHTSCAPE_GLOW_LEVELS } from "./nightscapeGlow";

describe("getNightscapePopulationGlow", () => {
  it("makes the largest city star-bright while keeping a small city dim", () => {
    const small = getNightscapePopulationGlow(10, 100_000);
    const large = getNightscapePopulationGlow(100_000, 100_000);

    expect(small.intensity).toBeLessThan(large.intensity);
    expect(small.level).toBeLessThan(large.level);
    expect(large.intensity).toBe(1);
    expect(large.level).toBe(NIGHTSCAPE_GLOW_LEVELS - 1);
  });

  it("handles missing or invalid population without producing an invalid brightness", () => {
    for (const population of [undefined, -10, Number.NaN]) {
      const glow = getNightscapePopulationGlow(population, 1000);
      expect(glow.intensity).toBeGreaterThan(0);
      expect(glow.intensity).toBeLessThanOrEqual(1);
      expect(glow.level).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("getNightscapeBeamPose", () => {
  it("aims the single light from the far side of the view back toward the camera", () => {
    const pose = getNightscapeBeamPose([0, 400, 500], [0, -0.6, -0.8], 1000, 700, 70, 1000 / 700);

    expect(pose.source[1]).toBeLessThan(400);
    expect(pose.source[2]).toBeLessThan(500);
    expect(pose.target[1]).toBeGreaterThan(400);
    expect(pose.target[2]).toBeGreaterThan(500);
    expect(pose.angle).toBeGreaterThan(0);
    expect(pose.angle).toBeLessThan(Math.PI / 2);
  });

  it("reverses the same camera-aligned beam without changing its cone", () => {
    const forward = getNightscapeBeamPose([0, 400, 500], [0, -0.6, -0.8], 1000, 700, 70, 1000 / 700);
    const reversed = getNightscapeBeamPose([0, 400, 500], [0, -0.6, -0.8], 1000, 700, 70, 1000 / 700, true);

    expect(reversed.source).toEqual(forward.target);
    expect(reversed.target).toEqual(forward.source);
    expect(reversed.angle).toBe(forward.angle);
  });
});
