import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { buildShare, decodeShare, encodeShare } from "../services/io/incomingCity";
import { buildBlockFabric } from "./blockInfill";
import { cellRelief } from "./cellRelief";
import { createGridDocument } from "./document";
import { forestLandCover } from "./forestLandCover";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { naturalTreeSuitability } from "./landscapeVegetation";
import { generateRuralFieldStage } from "./ruralFieldStage";
import { cityTerrain } from "./terrainElevation";

function generate(biomeKey = "temperateDeciduousForest") {
  const seed = "natural-hill";
  const input = createGridDocument({ size: "tiny", grid: "hex", seed });
  input.biome = { id: 6, key: biomeKey, name: biomeKey, color: "#448844", tags: [] };
  const settings = defaultGenerationSettings();
  settings.mode = "terrain";
  settings.config.rivers = [];
  settings.elevationPreset = "dome";
  settings.elevationRelief = 8;
  settings.terraces = { stepMeters: 10 };
  return { input, settings, seed, result: generateCityOnDocument(input, settings, seed)! };
}

describe("terrain generation", () => {
  it("creates continuous high-relief ground without settlement platforms or farms", () => {
    const { input, result } = generate();
    expect(result).not.toBeNull();
    expect(result.elements).toHaveLength(0);
    expect(result.featureGroups).toHaveLength(0);
    expect(cellRelief(result).steps).toHaveLength(0);
    const terrain = cityTerrain(result);
    expect(terrain.field).toBe(true);
    expect(terrain.heightAt([0, 0])).toBeGreaterThan(terrain.heightAt([100, 0]) + 10);
    const delta = terrain.heightAt([50, 0]) - terrain.heightAt([51, 0]);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(5);
    expect(forestLandCover(result).size).toBeGreaterThan(0);
    const fabric = buildBlockFabric(result);
    expect(fabric.buildings).toHaveLength(0);
    expect(fabric.farms).toHaveLength(0);
    expect(generateRuralFieldStage(result)).toBe(result);
    expect(input.terrain).toBeUndefined();
  });

  it("preserves rivers with natural sloping banks", () => {
    const { input, settings, seed } = generate();
    settings.config.rivers = ["through"];
    const result = generateCityOnDocument(input, settings, seed)!;
    expect(result.featureGroups.some(group => group.kind === "river")).toBe(true);
    expect(result.terrain!.features.length).toBeGreaterThan(0);
    expect(
      result.terrain!.features.every(feature => feature.kind === "riverCorridor" && feature.bank.kind === "slope")
    ).toBe(true);
    expect(parseDocument(serializeDocument(result))).not.toBeNull();
  });

  it("reduces natural tree density on dry, steep, and cold ground", () => {
    const { result } = generate();
    const flat = () => 0;
    const forest = naturalTreeSuitability(result, [0, 0], flat);
    expect(naturalTreeSuitability(result, [0, 0], point => point[0] * 0.8)).toBe(forest);
    result.biome = { ...result.biome!, key: "hotDesert" };
    expect(naturalTreeSuitability(result, [0, 0], flat)).toBeLessThan(forest / 10);
    expect(naturalTreeSuitability(result, [0, 0], point => point[0] * 2)).toBe(0);
    expect(naturalTreeSuitability(result, [0, 0], () => 4000)).toBe(0);
  });

  it("keeps treeless biomes bare and saves a replayable terrain recipe", () => {
    const { result, settings, seed } = generate("tundra");
    expect(forestLandCover(result).size).toBe(0);
    expect(parseDocument(serializeDocument(result))).not.toBeNull();
    const recipe = result.fabric!.generation!;
    const replay = generateCityOnDocument(recipe.input, recipe.settings, seed)!;
    expect(replay.terrain).toEqual(result.terrain);
    expect(
      decodeShare(encodeShare(buildShare({ seed, grid: "hex", size: "tiny", settings, input: recipe.input })))?.settings
        .mode
    ).toBe("terrain");
  });
});
