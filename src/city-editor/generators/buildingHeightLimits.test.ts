import { expect, it } from "vitest";
import { buildingSurfaces } from "../../city3d/core/massingGeometry";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { buildShare, decodeShare, encodeShare } from "../services/io/incomingCity";
import { documentFabricFingerprint } from "./blockInfill";
import { effectiveHeightLimit, inheritBuildingHeightLimits, maximumBuildingStoreys } from "./buildingHeightLimits";
import { DEFAULT_BUILDING_HEIGHT_POLICY, fitMorphologyHeightDistribution } from "./buildingHeightPolicy";
import type { BuildingLot } from "./buildingLots.types";
import { assignBuildingMassing } from "./buildingMassing";
import { createGridDocument } from "./document";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { defaultPopulationSettings } from "./populationPlan";
import { applyResidentialStoreys, residentialCapacity } from "./residentialCapacity";
import { ruralFieldOverlay, storeRuralFieldOverlay } from "./ruralFieldOverlay";
import { withBuildingHeightPolicy } from "./updateBuildingHeights";

function fixture() {
  const city = createGridDocument({ size: "tiny", grid: "hex", seed: "height-limits" });
  city.historicalPeriod = "lateMedieval";
  city.buildingHeightPolicy = DEFAULT_BUILDING_HEIGHT_POLICY;
  const faces = Object.values(city.mesh.faces);
  for (const face of faces) face.properties.settlement = "core";
  const lots: BuildingLot[] = faces.slice(0, 3).map((face, i) => ({
    id: `house-${i}`,
    faceId: face.id,
    polygon: [
      [i * 20, 0],
      [i * 20 + 10, 0],
      [i * 20 + 10, 8],
      [i * 20, 8]
    ],
    landmark: false,
    storeys: 4
  }));
  return { city, faces, lots };
}

it("enforces the stricter city/cell cap including the roof and leaves exceptional landmarks alone", () => {
  const { city, faces, lots } = fixture();
  city.buildingHeightLimit = { maxStoreys: 3, maxHeightMeters: 11 };
  faces[0].properties.buildingHeightLimit = { maxStoreys: 2, maxHeightMeters: 8 };
  faces[1].properties.buildingHeightLimit = { maxStoreys: 5, maxHeightMeters: 30 };
  faces[2].properties.buildingHeightLimit = { maxStoreys: 0 };
  expect(effectiveHeightLimit(city, faces[1].id)).toEqual(city.buildingHeightLimit);
  const marker = { ...lots[2], id: "landmark", landmark: true };
  const result = assignBuildingMassing(city, [...lots, marker]);
  expect(result.map(lot => lot.id)).toEqual([lots[0].id, lots[1].id, marker.id]);
  for (const lot of result.filter(lot => !lot.landmark)) {
    const limit = effectiveHeightLimit(city, lot.faceId);
    expect(lot.storeys).toBeLessThanOrEqual(limit.maxStoreys!);
    const surfaces = buildingSurfaces(lot.polygon, lot.massing!)!;
    const positions = [...surfaces.walls.positions, ...surfaces.roofs.positions];
    const height = Math.max(...positions.filter((_, i) => i % 3 === 1));
    expect(height).toBeLessThanOrEqual(limit.maxHeightMeters! + 1e-6);
  }
  expect(result[0].polygon).toBe(lots[0].polygon);
});

it("cannot increase past a legal cap to meet population, in either varied or uniform modes", () => {
  const { city, faces, lots } = fixture();
  city.buildingHeightLimit = { maxStoreys: 1 };
  faces[0].properties.buildingHeightLimit = { maxHeightMeters: 2 };
  city.urbanGrowth = {
    version: 1,
    requiredDwellings: 1000,
    insideStoreys: 4,
    outsideCap: 0,
    outsideBudget: 0,
    regions: [],
    openWedges: [],
    absorbedClusters: [],
    reasons: [],
    outerEnclosedUrbanAreaShare: null,
    innerEnclosedAreaShare: null
  };
  faces[1].properties.locked = true;
  const fitted = fitMorphologyHeightDistribution(city, applyResidentialStoreys(city, lots));
  expect(fitted[1].storeys).toBe(1);
  expect(fitted.every(lot => lot.storeys! <= 1)).toBe(true);
  expect(fitted[0].storeys).toBe(0);
  for (const policy of [DEFAULT_BUILDING_HEIGHT_POLICY, undefined]) {
    const rendered = assignBuildingMassing({ ...city, buildingHeightPolicy: policy }, fitted);
    expect(rendered.every(lot => lot.storeys === 1)).toBe(true);
    expect(rendered.reduce((sum, lot) => sum + residentialCapacity(lot), 0)).toBeLessThan(1000);
  }
  const store = { ...lots[1], role: "store" as const, uses: ["storage" as const], storeys: 3 };
  city.buildingHeightLimit = { maxHeightMeters: 4 };
  expect(maximumBuildingStoreys(city, store, 3, true)).toBe(0);
});

it("saves limits, rejects malformed caps and carries cell zoning to a replay input", () => {
  const { city, faces } = fixture();
  city.buildingHeightLimit = { maxStoreys: 3, maxHeightMeters: 12.5 };
  faces[0].properties.buildingHeightLimit = { maxStoreys: 1 };
  const overlay = { farms: [], lanes: [] };
  storeRuralFieldOverlay(city, documentFabricFingerprint(city), overlay);
  const limited = withBuildingHeightPolicy(
    { ...city, buildingHeightLimit: { maxStoreys: 2 } },
    city.buildingHeightPolicy,
    city
  );
  expect(ruralFieldOverlay(limited, documentFabricFingerprint(limited))).toBe(overlay);
  const saved = parseDocument(serializeDocument(city))!;
  expect(saved.buildingHeightLimit).toEqual(city.buildingHeightLimit);
  expect(saved.mesh.faces[faces[0].id].properties.buildingHeightLimit).toEqual({ maxStoreys: 1 });
  const source = createGridDocument({ size: "tiny", grid: "hex", seed: "height-limits" });
  expect(inheritBuildingHeightLimits(source, city).mesh.faces[faces[0].id].properties.buildingHeightLimit).toEqual({
    maxStoreys: 1,
    maxHeightMeters: undefined
  });
  expect(parseDocument(serializeDocument({ ...city, buildingHeightLimit: { maxStoreys: -1 } }))).toBeNull();
  const share = buildShare({
    seed: "height-limits",
    grid: "hex",
    size: "tiny",
    settings: { ...defaultGenerationSettings(), buildingHeightLimit: city.buildingHeightLimit },
    input: city
  });
  expect(decodeShare(encodeShare(share))!.settings.buildingHeightLimit).toEqual(city.buildingHeightLimit);
  const uniform = withBuildingHeightPolicy(saved, undefined);
  expect(uniform.buildingHeightPolicy).toBeUndefined();
  expect(uniform.buildingHeightLimit).toEqual(city.buildingHeightLimit);
  expect(parseDocument(serializeDocument(uniform))).not.toBeNull();
});

it("generates a limited uniform city without subdividing lots or exceeding the cap", () => {
  const settings = defaultGenerationSettings();
  settings.buildingHeightPolicy = undefined;
  settings.buildingHeightLimit = { maxStoreys: 2 };
  settings.population = defaultPopulationSettings(1000);
  settings.historicalPeriod = "lateMedieval";
  settings.config.coast = "none";
  settings.config.rivers = [];
  settings.config.features = { walls: false, citadel: false, port: false, temple: false, plaza: false, shanty: false };
  const city = generateCityOnDocument(
    createGridDocument({ size: "tiny", grid: "hex", seed: "height-uniform-cap" }),
    settings,
    "height-uniform-cap"
  )!;
  expect(city).not.toBeNull();
  expect(city.populationPlan!.heightPolicyVersion).toBe(2);
  expect(city.populationReport!.assignedPopulation + city.populationReport!.unplacedPopulation).toBe(1000);
  expect(
    city.residentialClusters!.every(cluster =>
      Object.keys(cluster.templateCounts).every(key => Number(key.split("f:")[0]) <= 2)
    )
  ).toBe(true);
  expect(parseDocument(serializeDocument(city))).not.toBeNull();
  const varied = withBuildingHeightPolicy(city, DEFAULT_BUILDING_HEIGHT_POLICY);
  expect(varied.buildingHeightPolicy).toEqual(DEFAULT_BUILDING_HEIGHT_POLICY);
  expect(varied.frame).toEqual(city.frame);
  expect(parseDocument(serializeDocument(varied))).not.toBeNull();
  const uniform = withBuildingHeightPolicy(varied, undefined);
  expect(uniform.populationPlan!.heightPolicyVersion).toBe(2);
  expect(parseDocument(serializeDocument(uniform))).not.toBeNull();
});
