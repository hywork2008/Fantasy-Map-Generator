import { describe, expect, it } from "vitest";
import { computeNaturalFloodRisk } from "./floodHazard";

describe("computeNaturalFloodRisk", () => {
  it("matches the pre-extraction formula for a low, wet, river cell (regression check against urbanWaterSystem.ts's own fixture)", () => {
    // Same inputs as urbanWaterSystem.test.ts's "flags wetland biomes and river cells" fixture.
    const risk = computeNaturalFloodRisk({
      cellId: 0,
      cells: { h: [25], r: [3], fl: [40], biomeCode: [12], g: [0] },
      biomesTags: Array.from({ length: 13 }, (_, i) => (i === 12 ? ["wetland"] : ["grassland"])),
      gridPrec: [70]
    });
    expect(risk).toBeCloseTo(0.5618, 4);
  });

  it("falls back to sane defaults with no river/biome/precipitation data", () => {
    const risk = computeNaturalFloodRisk({ cellId: 0, cells: { h: [50] } });
    // lowLand=0 (high ground), fluxRisk=0 (no river), wetRisk=0, rainRisk from the 45 default.
    expect(risk).toBeCloseTo(0.0375, 4);
  });

  it("raises risk for a river cell over an otherwise-identical non-river cell", () => {
    const withRiver = computeNaturalFloodRisk({ cellId: 0, cells: { h: [25], r: [1], fl: [40] } });
    const withoutRiver = computeNaturalFloodRisk({ cellId: 0, cells: { h: [25], r: [0], fl: [40] } });
    expect(withRiver).toBeGreaterThan(withoutRiver);
  });

  it("raises risk for a wetland biome over an otherwise-identical non-wetland cell", () => {
    const wetland = computeNaturalFloodRisk({
      cellId: 0,
      cells: { h: [25], biomeCode: [1] },
      biomesTags: [[], ["wetland"]]
    });
    const grassland = computeNaturalFloodRisk({
      cellId: 0,
      cells: { h: [25], biomeCode: [0] },
      biomesTags: [[], ["wetland"]]
    });
    expect(wetland).toBeGreaterThan(grassland);
  });

  it("raises risk with heavier precipitation", () => {
    const wet = computeNaturalFloodRisk({ cellId: 0, cells: { h: [25], g: [0] }, gridPrec: [90] });
    const dry = computeNaturalFloodRisk({ cellId: 0, cells: { h: [25], g: [0] }, gridPrec: [20] });
    expect(wet).toBeGreaterThan(dry);
  });
});
