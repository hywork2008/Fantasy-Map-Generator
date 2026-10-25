import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { buildShare, decodeShare, encodeShare } from "../services/io/incomingCity";
import { cityEditorSettings } from "../services/io/shareRequest";
import type { CityDocument } from "../types/document";
import { documentFabricFingerprint } from "./blockInfill";
import {
  assignResidentialHeightDistribution,
  DEFAULT_BUILDING_HEIGHT_POLICY,
  fitMorphologyHeightDistribution,
  fitResidentialHeightCapacity,
  type HeightUnit,
  hasBuildingHeightVariation
} from "./buildingHeightPolicy";
import type { BuildingLot } from "./buildingLots.types";
import { assignBuildingMassing } from "./buildingMassing";
import { createGridDocument } from "./document";
import { createFabricPlan } from "./fabricDistricts";
import { fitImportedHousing } from "./fitImportedHousing";
import { defaultGenerationSettings } from "./generation/settings";
import { finishPopulationHousing, populationFabricSource, populationHousingFabric } from "./populationHousing";
import { defaultPopulationSettings, planPopulation, validPopulationPlan } from "./populationPlan";
import { dwellingCapacity, residentialCapacity } from "./residentialCapacity";
import { ruralFieldOverlay, storeRuralFieldOverlay } from "./ruralFieldOverlay";
import { withBuildingHeightPolicy } from "./updateBuildingHeights";

function fixture() {
  const document = createGridDocument({ grid: "hex", size: "tiny", seed: "height-policy" });
  document.buildingHeightPolicy = { ...DEFAULT_BUILDING_HEIGHT_POLICY };
  document.generationSeed = "height-policy";
  document.historicalPeriod = "lateMedieval";
  const faces = Object.values(document.mesh.faces);
  for (const face of faces) {
    face.properties.settlement = "core";
    face.properties.ward = "craftsmen";
  }
  const lots: BuildingLot[] = Array.from({ length: 80 }, (_, i) => ({
    id: `house-${i}`,
    faceId: faces[i % faces.length].id,
    landmark: false,
    polygon: [
      [i * 40, 0],
      [i * 40 + 32, 0],
      [i * 40 + 32, 20],
      [i * 40, 20]
    ],
    uses: ["residential"]
  }));
  return { document, lots };
}

describe("building height distribution", () => {
  it("varies houses deterministically without changing locked houses or ancillary buildings", () => {
    const { document, lots } = fixture();
    const first = assignResidentialHeightDistribution(document, lots);
    expect(new Set(first.map(lot => lot.storeys)).size).toBeGreaterThan(1);
    const reverse = assignResidentialHeightDistribution(document, [...lots].reverse());
    expect(new Map(reverse.map(lot => [lot.id, lot.storeys]))).toEqual(
      new Map(first.map(lot => [lot.id, lot.storeys]))
    );
    expect(assignResidentialHeightDistribution(document, [lots[30]])[0].storeys).toBe(first[30].storeys);
    document.mesh.faces[lots[0].faceId].properties.locked = true;
    const locked = { ...lots[0], storeys: 1 };
    const shed = { ...lots[1], role: "shed" as const, storeys: 1 };
    expect(assignResidentialHeightDistribution(document, [locked, shed])).toEqual([locked, shed]);
  });

  it("keeps old documents and unsupported periods or cultures on legacy rules", () => {
    const { document } = fixture();
    expect(hasBuildingHeightVariation({ ...document, buildingHeightPolicy: undefined })).toBe(false);
    expect(hasBuildingHeightVariation({ ...document, historicalPeriod: "classicalAntiquity" })).toBe(false);
    expect(
      hasBuildingHeightVariation({
        ...document,
        civilization: { tradition: "sinitic" } as CityDocument["civilization"]
      })
    ).toBe(false);
    expect(
      parseDocument(
        serializeDocument({
          ...document,
          buildingHeightPolicy: { version: 2, profile: "european-medieval-v1" } as never
        })
      )
    ).toBeNull();
  });

  it("adds only the necessary legal increments, skips zero-capacity increments and is monotone in demand", () => {
    const units: HeightUnit[] = Array.from({ length: 10 }, (_, i) => ({
      key: `${i}`,
      storeys: 1,
      maximum: 4,
      priority: i / 10,
      footprint: 80
    }));
    const capacity = (values: HeightUnit[]) =>
      values.reduce((sum, unit) => sum + dwellingCapacity(unit.footprint, unit.storeys), 0);
    const low = fitResidentialHeightCapacity(units, capacity(units) + 1);
    expect(low.filter(unit => unit.storeys > 1)).toHaveLength(1);
    const high = fitResidentialHeightCapacity(units, capacity(units) + 8);
    expect(high.every((unit, i) => unit.storeys >= low[i].storeys && unit.storeys <= unit.maximum)).toBe(true);
    expect(capacity(high)).toBeGreaterThanOrEqual(capacity(units) + 8);
    const tiny = fitResidentialHeightCapacity([{ ...units[0], footprint: 30 }], 1);
    expect(tiny[0].storeys).toBe(3);
  });

  it("does not let excluded outside housing suppress core height fitting", () => {
    const { document, lots } = fixture();
    document.urbanGrowth = {
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
    const initial = assignResidentialHeightDistribution(document, lots);
    const fitted = fitMorphologyHeightDistribution(document, initial);
    const initialCapacity = initial.reduce((sum, lot) => sum + residentialCapacity(lot), 0);
    document.urbanGrowth.requiredDwellings = initialCapacity + 1;
    const partial = fitMorphologyHeightDistribution(document, initial);
    expect(partial.filter((lot, i) => lot.storeys !== initial[i].storeys)).toHaveLength(1);
    expect(fitted.every(lot => lot.storeys! <= 4)).toBe(true);
  });

  it("preserves the existing footprint layout in detailed and coarse displays", () => {
    const { document, lots } = fixture();
    lots.push({
      ...lots[0],
      id: "small-house",
      polygon: [
        [0, 30],
        [5, 30],
        [5, 35],
        [0, 35]
      ]
    });
    for (const housingDisplay of ["detailed", "cluster-10", "cluster-20"] as const) {
      const plan = planPopulation(
        { ...defaultPopulationSettings(1000), housingDisplay },
        "lateMedieval",
        document.frame.extentMeters,
        1
      );
      plan.housingFit = { storeys: 4, parcelAreaM2: 640, pass: 2 };
      const city = { ...document, populationPlan: plan };
      const source = { buildings: lots, farms: [], lanes: [], entrances: new Map() };
      const legacy = populationHousingFabric({ ...city, buildingHeightPolicy: undefined }, source);
      const varied = populationHousingFabric(city, source);
      expect(varied.buildings.map(lot => lot.polygon)).toEqual(legacy.buildings.map(lot => lot.polygon));
      finishPopulationHousing(city, varied);
      expect(city.populationReport!.assignedPopulation + city.populationReport!.unplacedPopulation).toBe(1000);
      expect(
        varied.buildings.every(
          lot =>
            !lot.residentialCluster ||
            lot.residentialCluster.assignedDwellings <= lot.residentialCluster.capacityDwellings
        )
      ).toBe(true);
      if (housingDisplay === "detailed") {
        expect(varied.buildings).toHaveLength(lots.length);
        expect(varied.buildings.at(-1)!.role).not.toBe("shed");
      }
    }
  });

  it("varies floor heights while keeping capacity, floor sums and saved-city geometry", () => {
    const { document, lots } = fixture();
    const result = assignBuildingMassing(
      document,
      lots.map(lot => ({ ...lot, storeys: 2 }))
    );
    expect(new Set(result.map(lot => lot.massing!.eaveHeightMeters)).size).toBeGreaterThan(1);
    for (const lot of result) {
      expect(lot.massing!.floors).toHaveLength(2);
      expect(lot.massing!.eaveHeightMeters).toBe(
        lot.massing!.floors.reduce((sum, floor) => sum + floor.heightMeters, 0)
      );
      expect(residentialCapacity(lot)).toBe(residentialCapacity({ ...lot, massing: undefined }));
    }
    const legacy = { ...document, buildingHeightPolicy: undefined };
    const fields = { farms: [], lanes: [] };
    storeRuralFieldOverlay(legacy, documentFabricFingerprint(legacy), fields);
    const updated = withBuildingHeightPolicy(legacy, DEFAULT_BUILDING_HEIGHT_POLICY);
    expect(ruralFieldOverlay(updated, documentFabricFingerprint(updated))).toBe(fields);
    expect(updated.mesh).toBe(legacy.mesh);
    expect(updated.featureGroups).toBe(legacy.featureGroups);
    expect(parseDocument(serializeDocument(updated))!.buildingHeightPolicy).toEqual(DEFAULT_BUILDING_HEIGHT_POLICY);
  });

  it("retains existing detailed footprints when a saved city opts in", () => {
    const { document, lots } = fixture();
    const old = {
      ...document,
      buildingHeightPolicy: undefined,
      populationPlan: planPopulation({ ...defaultPopulationSettings(3000), housingDisplay: "detailed" }, "lateMedieval")
    };
    const updated = withBuildingHeightPolicy(old, DEFAULT_BUILDING_HEIGHT_POLICY);
    expect(parseDocument(serializeDocument(updated))!.populationPlan).toEqual(updated.populationPlan);
    const fabric = populationHousingFabric(updated, { buildings: lots, farms: [], lanes: [], entrances: new Map() });
    expect(fabric.buildings).toHaveLength(lots.length);
    expect(fabric.buildings.map(lot => lot.polygon)).toEqual(lots.map(lot => lot.polygon));
    expect(populationFabricSource(updated).buildingPattern).toBe("legacy");
  });

  it("does not increase plot occupancy to compensate for low-rise imported housing", () => {
    const { document } = fixture();
    document.fabric = createFabricPlan(document, "height-occupancy");
    const before = document.fabric.districts.map(district => district.parameters.occupancy);
    fitImportedHousing(document, 100000);
    expect(document.fabric.districts.map(district => district.parameters.occupancy)).toEqual(before);
  });

  it("versions new area estimates and preserves legacy share defaults", () => {
    const settings = defaultPopulationSettings(3000);
    const legacy = planPopulation(settings);
    const varied = planPopulation(settings, "lateMedieval", 4800, 1);
    expect(varied.targetAreaM2).toBeGreaterThan(legacy.targetAreaM2);
    expect(validPopulationPlan(legacy)).toBe(true);
    expect(validPopulationPlan(varied)).toBe(true);
    const share = buildShare({
      seed: "height",
      grid: "hex",
      size: "tiny",
      settings: { ...defaultGenerationSettings(), buildingHeightPolicy: undefined }
    });
    expect(cityEditorSettings(decodeShare(encodeShare(share))!).buildingHeightPolicy).toBeUndefined();
    share.settings.buildingHeightPolicy = DEFAULT_BUILDING_HEIGHT_POLICY;
    share.settings.housingAreaScale = 2;
    share.settings.housingAreaPasses = 1;
    expect(decodeShare(encodeShare(share))!.settings).toMatchObject({ housingAreaScale: 2, housingAreaPasses: 1 });
    expect(decodeShare(encodeShare(share))!.settings.buildingHeightPolicy).toEqual(DEFAULT_BUILDING_HEIGHT_POLICY);
  });
});
