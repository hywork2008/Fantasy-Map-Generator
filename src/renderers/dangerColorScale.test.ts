import { interpolateMagma } from "d3";
import { describe, expect, it } from "vitest";
import {
  DANGER_MAGMA_EDGE_T,
  DANGER_MAGMA_PEAK_T,
  dangerBucketToMagmaT,
  dangerIntensityToMagmaT,
  dangerValueToBucket,
  dangerValueToMagmaT
} from "./dangerColorScale";

/** Relative red strength of a Magma hex (higher = redder / hotter). */
function redChannel(hex: string): number {
  return parseInt(hex.slice(1, 3), 16);
}

describe("dangerColorScale", () => {
  it("maps intensity 0 near Magma edge and 1 to the red peak (not pale yellow)", () => {
    expect(dangerIntensityToMagmaT(0)).toBeCloseTo(DANGER_MAGMA_EDGE_T, 5);
    expect(dangerIntensityToMagmaT(1)).toBeCloseTo(DANGER_MAGMA_PEAK_T, 5);
    expect(DANGER_MAGMA_PEAK_T).toBeLessThan(0.85);
  });

  it("assigns redder Magma to high buckets than low buckets (Contours-aligned)", () => {
    const weak = interpolateMagma(dangerBucketToMagmaT(0));
    const strong = interpolateMagma(dangerBucketToMagmaT(9));
    expect(redChannel(strong)).toBeGreaterThan(redChannel(weak));
    const paleYellow = interpolateMagma(1);
    const strongG = parseInt(strong.slice(3, 5), 16);
    const paleG = parseInt(paleYellow.slice(3, 5), 16);
    expect(strongG).toBeLessThan(paleG);
  });

  it("keeps monotonic increasing Magma t across buckets 0–9", () => {
    let prev = -1;
    for (let bucket = 0; bucket < 10; bucket++) {
      const t = dangerBucketToMagmaT(bucket);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it("buckets absolute danger so neighbors never change another cell's band", () => {
    expect(dangerValueToBucket(0)).toBe(-1);
    expect(dangerValueToBucket(1)).toBe(0);
    expect(dangerValueToBucket(25)).toBe(0);
    expect(dangerValueToBucket(26)).toBe(1);
    expect(dangerValueToBucket(200)).toBe(7); // floor(200/255 * 10) = 7
    expect(dangerValueToBucket(255)).toBe(9);
    // Same absolute value always same bucket (no map-wide max).
    expect(dangerValueToBucket(80)).toBe(dangerValueToBucket(80));
  });

  it("maps higher absolute danger to redder Magma than lower", () => {
    const low = interpolateMagma(dangerValueToMagmaT(40));
    const high = interpolateMagma(dangerValueToMagmaT(200));
    expect(redChannel(high)).toBeGreaterThan(redChannel(low));
  });
});
