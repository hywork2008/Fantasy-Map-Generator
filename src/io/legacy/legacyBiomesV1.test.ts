import { describe, expect, it } from "vitest";
import { snapshotToBiomesData } from "../../data/biomeCatalog";
import { decodeLegacyBiomesV1, LEGACY_BIOME_KEY_BY_CODE, parseLegacyBiomesField } from "./legacyBiomesV1";

describe("LegacyBiomeCodec (legacyBiomesV1)", () => {
  const standardColors =
    "#466eab,#fbe79f,#b5b887,#d2d082,#c8d68f,#b6d95d,#29bc56,#7dcb35,#409c43,#4b6b32,#96784b,#d5e7eb,#0b9131";
  const standardHabits = "0,4,10,22,30,50,100,80,90,12,4,0,12";
  const standardNames =
    "Marine,Hot desert,Cold desert,Savanna,Grassland,Tropical seasonal forest,Temperate deciduous forest,Tropical rainforest,Temperate rainforest,Taiga,Tundra,Glacier,Wetland";

  it("maps legacy codes 0–12 to standard BiomeKeys", () => {
    expect(LEGACY_BIOME_KEY_BY_CODE).toHaveLength(13);
    expect(LEGACY_BIOME_KEY_BY_CODE[6]).toBe("temperateDeciduousForest");
    expect(LEGACY_BIOME_KEY_BY_CODE[11]).toBe("glacier");
  });

  it("migrates standard 13 biomes and remaps cell codes", () => {
    const result = decodeLegacyBiomesV1({
      colorCsv: standardColors,
      habitabilityCsv: standardHabits,
      nameCsv: standardNames,
      cellCodesCsv: "0,6,11,12,4"
    });

    expect(result.biomeCode).toEqual(new Uint8Array([0, 6, 11, 12, 4]));
    expect(result.snapshot.keys[6]).toBe("temperateDeciduousForest");
    expect(result.snapshot.definitions[11]!.label).toBe("Glacier & perennial snowfield");
    // Full standard catalog available after migration for manual assignment
    expect(result.snapshot.keys).toContain("centralEuropeanGreatForest");
    expect(result.snapshot.keys).toContain("mangrove");

    const data = snapshotToBiomesData(result.snapshot);
    expect(data.name[11]).toBe("Glacier & perennial snowfield");
    expect(data.keys[6]).toBe("temperateDeciduousForest");
  });

  it("preserves custom biomes as legacyCustom keys with safe defaults", () => {
    const result = decodeLegacyBiomesV1({
      colorCsv: `${standardColors},#ff00aa`,
      habitabilityCsv: `${standardHabits},77`,
      nameCsv: `${standardNames},Mystic Marsh`,
      cellCodesCsv: "13,6,13"
    });

    const customIndex = result.snapshot.keys.indexOf("legacyCustom:13");
    expect(customIndex).toBeGreaterThanOrEqual(0);
    const def = result.snapshot.definitions[customIndex]!;
    expect(def.label).toBe("Mystic Marsh");
    expect(def.color).toBe("#ff00aa");
    expect(def.habitability).toBe(77);
    expect(def.relief.icons).toEqual({});
    expect(def.tags).toEqual([]);
    expect(def.movementCost).toBe(50);

    expect(result.biomeCode[0]).toBe(customIndex);
    expect(result.biomeCode[1]).toBe(6);
    expect(result.biomeCode[2]).toBe(customIndex);
  });

  it("parses the legacy data[3] field", () => {
    const parsed = parseLegacyBiomesField("a,b|1,2|X,Y");
    expect(parsed).toEqual({ colorCsv: "a,b", habitabilityCsv: "1,2", nameCsv: "X,Y" });
  });
});
