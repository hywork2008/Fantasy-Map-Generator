import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { pointInPolygon, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { cellHouseRing, unpackPoints } from "../fabric/pack";
import { regionArea, regionBoolean } from "../geometry/regions";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

describe("population facilities on the CE street blocks (facility mode)", () => {
  it("houses everyone round the facilities, each on whole lots of one street block", () => {
    const seed = "facility-lots",
      settings = {
        ...defaultGenerationSettings(),
        facilityLayout: "population" as const,
        wallShape: "polygon" as const
      };
    settings.config = {
      ...settings.config,
      rivers: [],
      features: { ...settings.config.features, walls: true, port: false, shanty: false }
    };
    settings.population = defaultPopulationSettings(2000);
    const input = vectorInputFromEditor({
        settings,
        seed,
        frame: { extentMeters: 600, cityRadiusMeters: 200, blockSizeMeters: 50 },
        lotOccupancy: 1
      }),
      wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration"),
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
      city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, mode: "medieval-facilities", population: 2000 }),
      report = city.urban!.report;
    expect(report.unplacedDwellings).toBe(0);
    expect(report.placedFacilities / report.requiredFacilities).toBeGreaterThan(0.85);
    const cells = Object.values(city.fabric!.cells);
    for (const id of city.urban!.ownedPlacements) {
      const p = city.placements[id];
      if (p.building?.kind !== "facility") continue;
      // Within one street block, and no house on its parcel.
      const c = polygonCentroid(p.site.outer),
        cell = cells.find(k => pointInPolygon(c, unpackPoints(k.ring, k.origin)))!;
      expect(cell).toBeDefined();
      expect(
        regionBoolean([p.site], [{ outer: unpackPoints(cell.ring, cell.origin), holes: [] }], "difference").reduce(
          (n, r) => n + regionArea(r),
          0
        )
      ).toBeLessThan(0.5);
      for (const k of cells)
        for (let i = 0; i < k.houses.offsets.length; i++)
          expect(
            regionBoolean([p.site], [{ outer: cellHouseRing(k, i), holes: [] }], "intersection").reduce(
              (n, r) => n + regionArea(r),
              0
            )
          ).toBeLessThan(1e-4);
    }
  }, 300000);
});
