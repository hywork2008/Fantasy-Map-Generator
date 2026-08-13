import { describe, expect, it } from "vitest";
import { createDefaultBiomesData, getBiomeCode } from "./biomeCatalog";
import { resolveBiomeOutputRate } from "./biomeEconomy";

describe("biomeEconomy", () => {
  it("resolves production from tags for new forest biomes without numeric entries", () => {
    const data = createDefaultBiomesData();
    const greatForest = getBiomeCode(data, "centralEuropeanGreatForest")!;
    const rate = resolveBiomeOutputRate(greatForest, { 6: 0.1 }, { forest: 0.1 }, data);
    expect(rate).toBe(0.1);
  });

  it("prefers explicit code over tag rates", () => {
    const data = createDefaultBiomesData();
    const deciduous = getBiomeCode(data, "temperateDeciduousForest")!;
    const rate = resolveBiomeOutputRate(deciduous, { [deciduous]: 0.2 }, { forest: 0.05 }, data);
    expect(rate).toBe(0.2);
  });

  it("resolves the same volcanic tag rate for all three volcano biomes and zero elsewhere (docs/plan/volcanic-biome-goods.md §3.2)", () => {
    const data = createDefaultBiomesData();
    const volcanicSoil = getBiomeCode(data, "volcanicSoil")!;
    const volcanicBarrens = getBiomeCode(data, "volcanicBarrens")!;
    const lavaField = getBiomeCode(data, "lavaField")!;
    const grassland = getBiomeCode(data, "grassland")!;
    const byTag = { volcanic: 0.05 };

    expect(resolveBiomeOutputRate(volcanicSoil, undefined, byTag, data)).toBe(0.05);
    expect(resolveBiomeOutputRate(volcanicBarrens, undefined, byTag, data)).toBe(0.05);
    expect(resolveBiomeOutputRate(lavaField, undefined, byTag, data)).toBe(0.05);
    expect(resolveBiomeOutputRate(grassland, undefined, byTag, data)).toBe(0);
  });
});
