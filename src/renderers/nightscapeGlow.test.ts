import { describe, expect, it } from "vitest";
import { getNightscapePopulationGlow, NIGHTSCAPE_GLOW_LEVELS } from "./nightscapeGlow";

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
