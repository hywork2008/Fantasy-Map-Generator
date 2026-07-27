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
});
