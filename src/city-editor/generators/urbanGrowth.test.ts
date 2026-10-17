import { describe, expect, it } from "vitest";
import { createUrbanMorphology } from "../../utils/urbanMorphology";
import { parseDocument } from "../services/io/documentCodec";
import type { BurgSiteRoadEntry } from "../types/contracts/burgSiteDescriptor";
import type { UrbanGrowthPlan } from "../types/contracts/urbanGrowth";
import type { DistrictFabric } from "./blockInfill";
import { buildBlockFabric } from "./blockInfill";
import type { BuildingLot } from "./buildingLots";
import { createGridDocument } from "./document";
import { createFabricPlan } from "./fabricDistricts";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { FabricCache } from "./localInfill";
import { applyResidentialStoreys, measureHousingCapacity, residentialCapacity } from "./residentialCapacity";
import { DEFAULT_SITE_CONFIG } from "./site/siteConfig";
import { synthSite } from "./site/synthSite";
import {
  allocateGrowthBudget,
  approachGrowthWeight,
  frontageSkewDegrees,
  polylineArc,
  shapeUrbanGrowthFabric
} from "./urbanGrowth";

const profile = createUrbanMorphology({
  seed: "test",
  burgId: 1,
  year: 341,
  population: 1000,
  capital: false,
  walls: true,
  polityAge: 178,
  generationYears: 30.5,
  polityPower: 0.5,
  defensePressure: 0.2,
  period: "ageOfExploration",
  religious: false,
  extramuralBurial: false,
  plaza: false
});
const rectangle: BuildingLot = {
  faceId: "f",
  polygon: [
    [0, 0],
    [8, 0],
    [8, 10],
    [0, 10]
  ],
  landmark: false,
  uses: ["residential"],
  storeys: 3
};
describe("capacity and constrained extramural growth", () => {
  it("separates residential floor capacity from footprints and non-residential roofs", () => {
    expect(residentialCapacity(rectangle)).toBe(3);
    expect(residentialCapacity({ ...rectangle, storeys: 2 })).toBe(2);
    expect(residentialCapacity({ ...rectangle, uses: ["storage"] })).toBe(0);
    expect(residentialCapacity({ ...rectangle, landmark: true })).toBe(0);
    expect(residentialCapacity({ ...rectangle, role: "shed" })).toBe(0);
    expect(
      residentialCapacity({
        ...rectangle,
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1]
        ]
      })
    ).toBe(0);
  });
  it("allocates exact integer totals, caps unusable gates and redistributes remaining capacity", () => {
    expect(
      allocateGrowthBudget(10, [
        { id: "west", weight: 2, capacity: 2 },
        { id: "east", weight: 1, capacity: 20 }
      ])
    ).toEqual({ west: 2, east: 8 });
    expect(allocateGrowthBudget(10, [{ id: "blocked", weight: 0 }])).toEqual({ blocked: 0 });
    expect(
      allocateGrowthBudget(1, [
        { id: "b", weight: 1 },
        { id: "a", weight: 1 }
      ])
    ).toEqual({ b: 0, a: 1 });
  });
  it("uses road connections and diplomacy even when economics claim the opposite", () => {
    const road = {
      group: "roads",
      nextBurg: { population: 10000, diplomacyRelation: "Friendly" },
      traffic: 1,
      trafficRank: 0
    } as BurgSiteRoadEntry;
    const baseline = approachGrowthWeight(road, 10, 0);
    expect(
      approachGrowthWeight(
        {
          ...road,
          traffic: 100000,
          trafficRank: 1,
          nextBurg: { ...road.nextBurg!, wealth: 10000, treasury: 999999, role: "market" }
        },
        10,
        0
      )
    ).toEqual(baseline);
    expect(
      approachGrowthWeight({ ...road, nextBurg: { ...road.nextBurg!, diplomacyRelation: "Enemy" } }, 10, 0).weight
    ).toBeLessThan(baseline.weight);
    expect(approachGrowthWeight({ ...road, group: "searoutes" }, 10, 0).weight).toBe(0);
  });
  it("distinguishes street-aligned frontage from diagonal infill", () => {
    expect(
      frontageSkewDegrees(rectangle.polygon, [
        [-10, 0],
        [20, 0]
      ])
    ).toBe(0);
    expect(
      frontageSkewDegrees(rectangle.polygon, [
        [-10, -10],
        [20, 20]
      ])
    ).toBeCloseTo(45);
  });

  it("measures curved roads by arc length", () => {
    expect(
      polylineArc(
        [10, 8],
        [
          [0, 0],
          [10, 0],
          [10, 10]
        ]
      )
    ).toEqual({ s: 18, distance: 0 });
  });
  it("never lets a suburb flag rescue houses without a permitted region", () => {
    const doc = createGridDocument({ size: "micro", grid: "hex", seed: "masks" });
    const face = Object.values(doc.mesh.faces)[0];
    face.properties.settlement = "outskirts";
    doc.urbanMorphology = profile;
    doc.fabric = createFabricPlan(doc, "masks");
    doc.fabric.districts.forEach(d => {
      d.parameters.suburb = true;
    });
    doc.urbanGrowth = {
      version: 1,
      requiredDwellings: 10,
      outsideCap: 2,
      outsideBudget: 2,
      insideStoreys: 3,
      regions: [],
      openWedges: [],
      absorbedClusters: [],
      reasons: [],
      outerEnclosedUrbanAreaShare: null,
      innerEnclosedAreaShare: null
    } satisfies UrbanGrowthPlan;
    const fabric: DistrictFabric = {
      buildings: [{ ...rectangle, faceId: face.id }],
      farms: [],
      lanes: [],
      entrances: new Map()
    };
    const result = shapeUrbanGrowthFabric(doc, fabric);
    expect(result.buildings).toHaveLength(0);
    const report = measureHousingCapacity(doc, result.buildings, 10);
    expect(report.unplacedDwellings).toBe(10);
    expect(report.assignedInside + report.assignedOutside + report.unplacedDwellings).toBe(10);
    expect(parseDocument(JSON.stringify(doc))?.urbanGrowth).toEqual(doc.urbanGrowth);
    const corrupt = { ...doc, urbanGrowth: { ...doc.urbanGrowth, outsideBudget: 100 } };
    expect(parseDocument(JSON.stringify(corrupt))).toBeNull();
  });
  it("respects manual storeys and era ceilings", () => {
    const doc = createGridDocument({ size: "micro", seed: "levels" });
    const face = Object.values(doc.mesh.faces)[0];
    doc.urbanMorphology = { ...profile, period: "highMedieval" };
    face.properties.settlement = "core";
    face.properties.locked = true;
    expect(applyResidentialStoreys(doc, [{ ...rectangle, faceId: face.id, storeys: 1 }])[0].storeys).toBe(1);
    face.properties.locked = false;
    expect(applyResidentialStoreys(doc, [{ ...rectangle, faceId: face.id, storeys: 5 }])[0].storeys).toBe(2);
  });
});

describe("common growth masks across generators", () => {
  for (const grid of ["hex", "voronoi", "evolution"] as const) {
    it(`fits and diagnoses both housing styles on ${grid}`, () => {
      const seed = "fabric-growth";
      const doc = createGridDocument({ size: "tiny", grid, seed });
      const config = { ...DEFAULT_SITE_CONFIG, coast: "none" as const, rivers: [], relief: "flat" as const };
      const descriptor = synthSite("smallTown", config, seed, doc.frame);
      descriptor.urbanMorphology = { ...profile, baselinePopulation: descriptor.burg.population };
      for (const buildingPattern of ["legacy", "medieval"] as const) {
        const city = generateCityOnDocument(
          doc,
          { ...defaultGenerationSettings(), config, descriptor, buildingPattern },
          seed
        );
        expect(city).not.toBeNull();
        expect(city!.housingCapacity).toBeDefined();
        const lots = buildBlockFabric(city!, new FabricCache()).buildings;
        const capacity = measureHousingCapacity(city!, lots, descriptor.burg.dwellings);
        expect(capacity.assignedInside + capacity.assignedOutside + capacity.unplacedDwellings).toBe(
          descriptor.burg.dwellings
        );
        for (const lot of lots)
          if (city!.mesh.faces[lot.faceId]?.properties.settlement === "outskirts")
            expect(lot.growthRegionId).toBeTruthy();
      }
    });
  }
});

describe("approachGrowthWeight with measured traffic (O4)", () => {
  const road = (share: number, population: number) =>
    ({
      group: "roads",
      nextBurg: { id: 2, name: "B", population },
      approachTraffic: { cargoSlots: share * 10, through: 0, share }
    }) as unknown as BurgSiteRoadEntry;

  it("ranks by traffic share instead of the neighbour's population", () => {
    const busySmall = approachGrowthWeight(road(0.8, 100), Math.log1p(10000), Math.log1p(100), 0.8);
    const quietLarge = approachGrowthWeight(road(0.2, 10000), Math.log1p(10000), Math.log1p(100), 0.8);
    expect(busySmall.weight).toBeGreaterThan(quietLarge.weight);
    // Default: the population proxy still decides.
    const proxySmall = approachGrowthWeight(road(0.8, 100), Math.log1p(10000), Math.log1p(100));
    const proxyLarge = approachGrowthWeight(road(0.2, 10000), Math.log1p(10000), Math.log1p(100));
    expect(proxySmall.weight).toBeLessThan(proxyLarge.weight);
  });
});
