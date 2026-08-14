import { describe, expect, it } from "vitest";
import { waterTechRaceBiasFor } from "./raceWaterTechBias";

describe("waterTechRaceBiasFor", () => {
  it("returns a bias for giant on a Fantasy culture set", () => {
    const highFantasy = waterTechRaceBiasFor("giant", "highFantasy");
    expect(highFantasy).not.toBeNull();
    expect(highFantasy?.ceilingBonus.waterLifting).toBeGreaterThan(0);
    expect(highFantasy?.ceilingBonus.municipalSanitation).toBeGreaterThan(0);
    expect(highFantasy?.urgencyThresholdMultiplier).toBeLessThan(1);
    expect(highFantasy?.constructionSpeedMultiplier).toBeGreaterThan(1);

    const darkFantasy = waterTechRaceBiasFor("giant", "darkFantasy");
    expect(darkFantasy).not.toBeNull();
  });

  it("returns null outside Fantasy culture sets", () => {
    expect(waterTechRaceBiasFor("giant", "world")).toBeNull();
    expect(waterTechRaceBiasFor("giant", undefined)).toBeNull();
  });

  it("returns null for races without an entry, even on a Fantasy culture set", () => {
    expect(waterTechRaceBiasFor("human", "highFantasy")).toBeNull();
    expect(waterTechRaceBiasFor("dwarf", "highFantasy")).toBeNull();
    expect(waterTechRaceBiasFor(undefined, "highFantasy")).toBeNull();
  });
});
