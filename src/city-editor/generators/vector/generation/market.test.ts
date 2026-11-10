import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { pointInPolygon } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { vectorInputFromEditor } from "./editorInput";
import { CIVIC_PLAZA_ID } from "./market";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };

describe("market day on the civic plaza (feature parity P6b)", () => {
  it("lays the mesh editor's six stalls along the plaza's long sides, clear of the streets, in a walled river town", () => {
    const seed = "m1",
      settings = { ...defaultGenerationSettings(), population: defaultPopulationSettings(5000) };
    settings.config = {
      ...settings.config,
      coast: "none",
      rivers: ["through"],
      features: { ...settings.config.features, plaza: true, temple: true, walls: true }
    };
    const skeleton = generateVectorSkeleton(vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }), {
        ...DEFAULT_VECTOR_GENERATION,
        seed,
        ...vectorWallChoice(settings, seed, "lateMedieval")
      }).document,
      plaza = skeleton.environment!.features[CIVIC_PLAZA_ID],
      // The square's furniture (B6b) is listed with the plaza too; the stalls are the rest.
      stalls = plaza.placementIds.filter(id => id !== "civic:plaza-furniture").map(id => skeleton.placements[id]);
    expect(skeleton.placements["civic:plaza-furniture"]?.modelId).toMatch(/^(pillory-and-stocks|market-cross-)/);
    expect(plaza.settings.activity).toBe("market-day");
    expect(stalls.map(s => s.modelId)).toEqual([
      "market-produce-stall",
      "market-bread-stall",
      "market-grain-table",
      "market-produce-stall",
      "market-goods-booth",
      "market-bread-stall"
    ]);
    const roads = Object.values(skeleton.paths)
      .filter(p => p.role === "road")
      .map(pathSurface);
    for (const stall of stalls) {
      expect(stall.site.outer.every(p => pointInPolygon(p, plaza.boundary.outer))).toBe(true);
      expect(regionBoolean([stall.site], roads, "intersection").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(
        1e-3
      );
    }
    expect(plaza.pieces.some(p => p.id.includes(":aisle:"))).toBe(true);
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 });
    expect(city.placements[stalls[0].id]).toEqual(stalls[0]);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});
