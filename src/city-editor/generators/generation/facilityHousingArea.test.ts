import { expect, it } from "vitest";
import type { BuildingLot } from "../buildingLots.types";
import { createGridDocument } from "../document";
import { polygonCentroid } from "../geom";
import { facePoints } from "../mesh";
import { preparePopulationGeneration } from "../populationGeneration";
import { defaultPopulationSettings, planPopulation } from "../populationPlan";
import { synthSite } from "../site/synthSite";
import { nextHousingAreaScale } from "./heightArea";
import { prepareRun } from "./prepareRun";
import { defaultGenerationSettings } from "./settings";

function fixture() {
  const source = createGridDocument({ size: "tiny", grid: "hex", seed: "facility-housing-area" });
  const face = Object.values(source.mesh.faces)[0];
  face.properties.settlement = "core";
  const settings = {
    ...defaultGenerationSettings(),
    buildingHeightPolicy: undefined,
    facilityLayout: "population" as const,
    population: defaultPopulationSettings(45)
  };
  const result = { ...source, populationPlan: planPopulation(settings.population), buildingHeightPolicy: undefined };
  const lots: BuildingLot[] = Array.from({ length: 10 }, (_, i) => ({
    faceId: face.id,
    landmark: false,
    storeys: 1,
    polygon: [
      [i * 8, 0],
      [i * 8 + 8, 0],
      [i * 8 + 8, 10],
      [i * 8, 10]
    ]
  }));
  return { source, result, settings, lots, face };
}

it("expands only for a final dwelling deficit, without requiring a height policy", () => {
  const { source, result, settings, lots } = fixture();
  expect(nextHousingAreaScale(source, result, settings, lots)).toBeUndefined();
  expect(
    nextHousingAreaScale(source, result, { ...settings, facilityLayout: undefined }, lots.slice(1))
  ).toBeUndefined();
  expect(nextHousingAreaScale(source, result, settings, lots.slice(1))).toBeGreaterThan(1);
  expect(nextHousingAreaScale(source, result, { ...settings, housingAreaPasses: 3 }, lots.slice(1))).toBeUndefined();
  expect(
    nextHousingAreaScale(
      source,
      result,
      { ...settings, population: { ...settings.population, frameMode: "manual" } },
      lots.slice(1)
    )
  ).toBeUndefined();
  expect(
    nextHousingAreaScale(
      { ...source, elements: [{ id: "locked", kind: "tree", faceIds: [], locked: true }] },
      result,
      settings,
      lots.slice(1)
    )
  ).toBeUndefined();
});

it("credits the dwelling in a workhome instead of adding an unnecessary core cell", () => {
  const { source, result, settings, lots, face } = fixture();
  const position = polygonCentroid(facePoints(result.mesh, face));
  result.landmarkAssets = [
    {
      id: "workhome",
      revision: "1",
      name: "Workhome",
      historicalPhase: "medieval",
      referenceSizeMeters: [8, 10],
      dimensionSource: "test",
      provenanceId: "test",
      footprint: [],
      minimumSite: [],
      entrances: [],
      renderSvg: "",
      residentialDwellings: 1
    }
  ];
  result.landmarks = [
    {
      id: "mixed",
      assetId: "workhome",
      assetRevision: "1",
      position,
      rotation: 0,
      scale: 1,
      site: [],
      accesses: [],
      locked: false
    }
  ];
  expect(nextHousingAreaScale(source, result, settings, lots.slice(1))).toBeUndefined();
});

it("applies a measured facility-area correction to population planning and imported town radius", () => {
  const { source, settings } = fixture();
  const base = preparePopulationGeneration(source, settings, "facility-housing-area");
  const scaled = preparePopulationGeneration(source, { ...settings, housingAreaScale: 2 }, "facility-housing-area");
  expect(scaled.document.populationPlan!.targetAreaM2).toBeCloseTo(base.document.populationPlan!.targetAreaM2 * 2);
  const descriptor = synthSite("smallTown", settings.config, "facility-housing-area", {
    extentMeters: 600,
    cityRadiusMeters: 100
  });
  const imported = { ...settings, population: undefined, descriptor, housingAreaScale: 2 };
  expect(prepareRun(source, imported, "facility-housing-area", false).params.cityRadiusMeters).toBeCloseTo(
    100 * Math.sqrt(2)
  );
});
