import { describe, expect, it } from "vitest";
import { STANDARD_BIOME_KEYS } from "../types/biome";
import {
  biomeHasTag,
  biomesDataToSnapshot,
  buildCatalogFromDefinitions,
  CLIMATE_MATRIX_BY_KEY,
  catalogToBiomesData,
  createDefaultBiomeCatalog,
  createDefaultBiomesData,
  getBiomeCode,
  getBiomeKey,
  isForestBiome,
  isNomadicBiome,
  isSnowBiome,
  STANDARD_BIOME_COUNT,
  STANDARD_BIOME_DEFINITIONS,
  snapshotToBiomesData,
  validateBiomeCatalogSnapshot
} from "./biomeCatalog";

describe("biomeCatalog", () => {
  it("defines every STANDARD_BIOME_KEYS entry exactly once", () => {
    expect(STANDARD_BIOME_DEFINITIONS).toHaveLength(STANDARD_BIOME_KEYS.length);
    expect(STANDARD_BIOME_COUNT).toBe(26);
    const keys = STANDARD_BIOME_DEFINITIONS.map(d => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of STANDARD_BIOME_KEYS) {
      expect(keys).toContain(key);
    }
  });

  it("compiles climate matrix rows to codes without depending on definition order", () => {
    // Reverse catalog order — codes change, keys in matrix stay valid
    const reversed = [...STANDARD_BIOME_DEFINITIONS].reverse();
    const catalog = buildCatalogFromDefinitions(reversed);
    const data = catalogToBiomesData(catalog);
    const deciduous = catalog.codesByKey.temperateDeciduousForest;
    expect(typeof deciduous).toBe("number");

    // Moisture band 2, temperature band 1 is temperate deciduous in the source matrix
    const keyAt = CLIMATE_MATRIX_BY_KEY[2]![1];
    expect(keyAt).toBe("temperateDeciduousForest");
    expect(data.biomesMatrix[2]![1]).toBe(deciduous);
  });

  it("exposes forest/nomadic/snow tags for game logic", () => {
    const data = createDefaultBiomesData();
    const deciduous = getBiomeCode(data, "temperateDeciduousForest")!;
    const grassland = getBiomeCode(data, "grassland")!;
    const glacier = getBiomeCode(data, "glacier")!;
    const greatForest = getBiomeCode(data, "centralEuropeanGreatForest")!;

    expect(isForestBiome(data, deciduous)).toBe(true);
    expect(isForestBiome(data, greatForest)).toBe(true);
    expect(isForestBiome(data, grassland)).toBe(false);
    expect(isNomadicBiome(data, grassland)).toBe(true);
    expect(isSnowBiome(data, glacier)).toBe(true);
    expect(biomeHasTag(data, glacier, "cold")).toBe(true);
    expect(getBiomeKey(data, glacier)).toBe("glacier");
    expect(data.name[glacier]).toBe("Glacier & perennial snowfield");
  });

  it("round-trips BiomeCatalogSnapshot", () => {
    const data = createDefaultBiomesData();
    const snapshot = biomesDataToSnapshot(data);
    validateBiomeCatalogSnapshot(snapshot);
    const restored = snapshotToBiomesData(snapshot);
    expect(restored.keys).toEqual(data.keys);
    expect(restored.name).toEqual(data.name);
    expect(restored.color).toEqual(data.color);
    expect(getBiomeCode(restored, "mangrove")).toBe(getBiomeCode(data, "mangrove"));
  });

  it("rejects invalid snapshots", () => {
    expect(() =>
      validateBiomeCatalogSnapshot({
        version: 1,
        keys: ["a", "a"],
        definitions: [
          {
            key: "a",
            label: "A",
            color: "#000",
            habitability: 1,
            movementCost: 1,
            relief: { density: 0, icons: {} },
            tags: []
          },
          {
            key: "a",
            label: "A",
            color: "#000",
            habitability: 1,
            movementCost: 1,
            relief: { density: 0, icons: {} },
            tags: []
          }
        ]
      })
    ).toThrow(/duplicate key/);

    expect(() =>
      validateBiomeCatalogSnapshot({
        version: 1,
        keys: ["a"],
        definitions: [
          {
            key: "b",
            label: "B",
            color: "#000",
            habitability: 1,
            movementCost: 1,
            relief: { density: 0, icons: {} },
            tags: []
          }
        ]
      })
    ).toThrow(/mismatch/);
  });

  it("keeps default codes 0–12 stable for the historical 13 biomes", () => {
    const catalog = createDefaultBiomeCatalog();
    expect(catalog.codesByKey.marine).toBe(0);
    expect(catalog.codesByKey.temperateDeciduousForest).toBe(6);
    expect(catalog.codesByKey.glacier).toBe(11);
    expect(catalog.codesByKey.wetland).toBe(12);
    expect(catalog.codesByKey.centralEuropeanGreatForest).toBe(13);
    expect(catalog.codesByKey.floodedForest).toBe(22);
    expect(catalog.codesByKey.coldSteppe).toBe(23);
    expect(catalog.codesByKey.tropicalDryForest).toBe(24);
    expect(catalog.codesByKey.borealPeatland).toBe(25);
  });

  it("tags Phase 5 biomes for economy and movement", () => {
    const data = createDefaultBiomesData();
    const steppe = getBiomeCode(data, "coldSteppe")!;
    const dryForest = getBiomeCode(data, "tropicalDryForest")!;
    const peat = getBiomeCode(data, "borealPeatland")!;
    expect(isNomadicBiome(data, steppe)).toBe(true);
    expect(isForestBiome(data, dryForest)).toBe(true);
    expect(biomeHasTag(data, peat, "wetland")).toBe(true);
    expect(biomeHasTag(data, peat, "cold")).toBe(true);
    expect(isForestBiome(data, peat)).toBe(false);
  });
});
