import { describe, expect, it } from "vitest";
import { buildingAppearanceColors } from "../../buildings/appearance/colors";
import { BUILDING_APPEARANCE_CLIMATES, BUILDING_WALL_FINISHES } from "../../buildings/appearance/types";
import { buildBlockFabric, documentFabricFingerprint } from "./blockInfill";
import { assignBuildingAppearances, stableBuildingAppearanceId, withBuildingAppearance } from "./buildingAppearance";
import { buildingAppearancePreview } from "./buildingAppearancePreview";
import type { BuildingLot } from "./buildingLots.types";
import { assignBuildingMassing } from "./buildingMassing";
import { createDocument } from "./document";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { preparePopulationGeneration } from "./populationGeneration";
import { defaultPopulationSettings } from "./populationPlan";
import { residentialCapacity } from "./residentialCapacity";

const lot: BuildingLot = {
  faceId: "block",
  polygon: [
    [0, 0],
    [8, 0],
    [8, 12],
    [0, 12]
  ],
  landmark: false,
  storeys: 2,
  role: "main",
  uses: ["residential"],
  residentialFloorShare: 0.85
};

function geometryAndCapacity(building: BuildingLot) {
  const { appearance, massing, ...rest } = building;
  return { ...rest, massing: massing ? { ...massing, roof: { ...massing.roof, material: undefined } } : undefined };
}

describe("CE building appearance integration", () => {
  it("overrides brick walls in every climate without changing the roof, massing or capacity", () => {
    const source = createDocument("wall-finish", 400);
    const sample = buildingAppearancePreview("mediterranean")[0];
    sample.massing = { ...sample.massing!, wall: "brick" };
    for (const climate of BUILDING_APPEARANCE_CLIMATES) {
      const auto = withBuildingAppearance({ ...source, buildingAppearanceClimate: climate }, "mediterranean");
      const before = assignBuildingAppearances(auto, [sample])[0];
      expect(before.appearance?.wallPaletteId).toBe("brick");
      for (const finish of BUILDING_WALL_FINISHES) {
        const document = { ...auto, buildingWallFinish: finish };
        const after = assignBuildingAppearances(document, [sample])[0];
        expect(after.massing).toEqual(before.massing);
        expect(after.appearance?.roofPaletteId).toBe(before.appearance?.roofPaletteId);
        expect(residentialCapacity(after)).toBe(residentialCapacity(before));
        expect(buildingAppearanceColors(after.appearance)?.wall).not.toBeUndefined();
        expect(documentFabricFingerprint(document)).not.toBe(documentFabricFingerprint(auto));
        if (finish === "limewash") {
          expect(after.appearance?.wallPaletteId).toBe("white-limewash");
          expect(after.appearance?.wallFinish).toBe("limewash");
          expect(after.appearance?.framePaletteId).toBeUndefined();
        }
      }
    }
    const document = withBuildingAppearance({ ...source, buildingWallFinish: "limewash" }, "mediterranean");
    const prepared = preparePopulationGeneration(
      document,
      {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(500)
      },
      "wall-finish"
    ).document;
    expect(prepared.buildingWallFinish).toBe("limewash");
  });
  it("applies persisted climate overrides to finishes and retains them when population fitting rebuilds the grid", () => {
    const source = createDocument("appearance-climate", 400);
    source.biome = { id: 1, key: "desert", name: "Desert", color: "tan" };
    const forest = withBuildingAppearance({ ...source, buildingAppearanceClimate: "forest" }, "northern-wooded");
    const arid = withBuildingAppearance({ ...forest, buildingAppearanceClimate: "arid" });
    const sample = { ...buildingAppearancePreview("northern-wooded")[0], role: "shed" as const };
    expect(assignBuildingAppearances(forest, [sample])[0].appearance?.wallFinish).toBe("timber-boarding");
    expect(assignBuildingAppearances(arid, [sample])[0].appearance?.wallFinish).toBe("plaster-infill");
    const settings = { ...defaultGenerationSettings(), population: defaultPopulationSettings(500) };
    const prepared = preparePopulationGeneration(forest, settings, "appearance-climate").document;
    expect(prepared.mesh).not.toBe(forest.mesh);
    expect(prepared.buildingAppearanceProfile).toBe("northern-wooded");
    expect(prepared.buildingAppearanceClimate).toBe("forest");
    expect(withBuildingAppearance(prepared).buildingAppearanceContext?.forest).toBe(true);
    expect(source.buildingAppearanceClimate).toBeUndefined();
  });
  it("keeps no-ID colors stable when a ring or the lot list is reordered", () => {
    const document = createDocument("appearance-order", 400);
    document.buildingAppearanceProfile = "atlantic";
    const second = { ...lot, polygon: lot.polygon.map(([x, y]) => [x + 20, y] as [number, number]) };
    const rotated = { ...lot, polygon: [...lot.polygon.slice(2), ...lot.polygon.slice(0, 2)].reverse() };
    expect(stableBuildingAppearanceId(lot)).toBe(stableBuildingAppearanceId(rotated));
    expect(stableBuildingAppearanceId(lot)).not.toBe(stableBuildingAppearanceId(second));
    const before = assignBuildingAppearances(document, assignBuildingMassing(document, [lot, second]));
    const after = assignBuildingAppearances(document, assignBuildingMassing(document, [second, rotated]));
    expect(before[0].appearance).toEqual(after[1].appearance);
    expect(before[1].appearance).toEqual(after[0].appearance);
    expect(before[0].polygon).toBe(lot.polygon);
    expect(residentialCapacity(before[0])).toBe(residentialCapacity(lot));
  });

  it("changes regional roof coverings without changing geometry, capacity, lots or streets", () => {
    const document = generateCityOnDocument(
      createDocument("appearance-geometry", 400),
      defaultGenerationSettings(),
      "regional-appearance"
    )!;
    expect(document).not.toBeNull();
    delete document.buildingAppearanceVersion;
    const beforeDocument = JSON.stringify(document);
    const legacy = buildBlockFabric(document);
    const upgraded = withBuildingAppearance(document, "mediterranean");
    const current = buildBlockFabric(upgraded);
    expect(current.buildings.length).toBeGreaterThan(0);
    expect(current.buildings.some(b => b.appearance)).toBe(true);
    expect(current.buildings.map(geometryAndCapacity)).toEqual(legacy.buildings.map(geometryAndCapacity));
    expect(current.lanes).toEqual(legacy.lanes);
    expect(JSON.stringify(document)).toBe(beforeDocument);
    expect(buildBlockFabric(upgraded)).toBe(current);
    upgraded.buildingAppearanceProfile = "stone-upland";
    const recolored = buildBlockFabric(upgraded);
    expect(recolored).not.toBe(current);
    expect(recolored.buildings.filter(b => b.appearance).every(b => b.appearance?.profileId === "stone-upland")).toBe(
      true
    );
    expect(recolored.buildings.map(geometryAndCapacity)).toEqual(legacy.buildings.map(geometryAndCapacity));
  });

  it("captures inputs only on explicit refresh and invalidates the cache outside rural-fields mode", () => {
    const document = createDocument("appearance-cache", 400);
    document.biome = { id: 1, key: "taiga", name: "Forest", color: "green" };
    const captured = withBuildingAppearance(document, "northern-wooded");
    const before = documentFabricFingerprint(captured);
    captured.biome!.key = "tundra";
    expect(captured.buildingAppearanceContext?.forest).toBe(true);
    expect(documentFabricFingerprint(captured)).not.toBe(before);
    const refreshed = withBuildingAppearance(captured);
    expect(refreshed.buildingAppearanceContext?.forest).toBe(false);
    expect(documentFabricFingerprint(refreshed)).not.toBe(documentFabricFingerprint(captured));
    const changedProfile = { ...refreshed, buildingAppearanceProfile: "atlantic" as const };
    expect(documentFabricFingerprint(changedProfile)).not.toBe(documentFabricFingerprint(refreshed));
  });

  it("opts a legacy document into version 1 only when explicitly generating a new city", () => {
    const document = createDocument("appearance-generation", 400);
    delete document.buildingAppearanceVersion;
    const settings = defaultGenerationSettings();
    settings.historicalPeriod = "highMedieval";
    const result = generateCityOnDocument(document, settings, "regional-appearance");
    expect(result).not.toBeNull();
    expect(result?.buildingAppearanceVersion).toBe(1);
    expect(result?.buildingAppearanceContext?.period).toBe("highMedieval");
    expect(document.buildingAppearanceVersion).toBeUndefined();
  });
});
