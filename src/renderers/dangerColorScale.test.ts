import { interpolateMagma } from "d3";
import { describe, expect, it } from "vitest";
import {
  DANGER_MAGMA_EDGE_T,
  DANGER_MAGMA_PEAK_T,
  dangerBucketToMagmaT,
  dangerIntensityToMagmaT
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
    // Peak band is red/coral; edge is dark purple — red channel rises with threat.
    expect(redChannel(strong)).toBeGreaterThan(redChannel(weak));
    // Full Magma t=1 is pale yellow (#fcfdbf); our peak must stay redder / darker.
    const paleYellow = interpolateMagma(1);
    expect(redChannel(strong)).toBeLessThanOrEqual(redChannel(paleYellow) + 5);
    // Strong should not be as bright/pale as t=1 — green channel is high in pale yellow.
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
});
