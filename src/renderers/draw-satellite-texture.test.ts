import { describe, expect, test } from "vitest";
import { worldContext } from "../context/worldContext";
import type { BiomesData } from "../types/WorldState";
import { getSatelliteBiomeData } from "./draw-satellite-texture";

/** First custom slot after the standard 23-biome catalog (codes 0..22). */
const CUSTOM_BIOME_CODE = 23;

const setBiomeColors = (colors: string[]) => {
  worldContext.biomesData = {
    i: [],
    name: [],
    color: colors,
    biomesMatrix: [],
    habitability: [],
    iconsDensity: [],
    icons: [],
    cost: [],
    keys: [],
    tags: []
  } as unknown as BiomesData;
};

describe("getSatelliteBiomeData", () => {
  test("returns the built-in satellite palette for standard biomes", () => {
    const biome = getSatelliteBiomeData(4, 1);

    expect(biome).toEqual({ color: [0.45, 0.59, 0.25], density: 0.45 });
  });

  test("uses the custom biome color and the area's fallback density", () => {
    const colors = new Array(CUSTOM_BIOME_CODE + 1).fill("");
    colors[CUSTOM_BIOME_CODE] = "#123456";
    setBiomeColors(colors);

    const biome = getSatelliteBiomeData(CUSTOM_BIOME_CODE, 4);

    expect(biome).toEqual({ color: [18 / 255, 52 / 255, 86 / 255], density: 0.45 });
  });

  test("falls back to the area's built-in biome data if custom color cannot be parsed", () => {
    const colors = new Array(CUSTOM_BIOME_CODE + 1).fill("");
    colors[CUSTOM_BIOME_CODE] = "not-a-color";
    setBiomeColors(colors);

    const biome = getSatelliteBiomeData(CUSTOM_BIOME_CODE, 4);

    expect(biome).toEqual({ color: [0.45, 0.59, 0.25], density: 0.45 });
  });
});
