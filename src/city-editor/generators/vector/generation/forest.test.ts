import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { validateVectorForest } from "../forest";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { windmillSweep } from "../landmark";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";

const build = (mode: "legacy" | "surroundings") => {
  const settings = {
      ...defaultGenerationSettings(),
      population: defaultPopulationSettings(3000),
      historicalPeriod: "lateMedieval" as const,
      buildingPattern: "medieval" as const,
      forestSettings: { version: 1 as const, mode, density: "standard" as const }
    },
    seed = "p7b-forest",
    input = vectorInputFromEditor({
      settings,
      seed,
      frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
      lotOccupancy: 1
    });
  return generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document;
};
const area = (r: Parameters<typeof regionArea>[0][]) => r.reduce((n, p) => n + regionArea(p), 0);

describe("woodland by the forest settings (feature parity P7b)", () => {
  it("covers the countryside beyond the town's land, clear of roads, the glacis and reserved sites", () => {
    expect(build("legacy").environment?.forest).toBeUndefined();
    const doc = build("surroundings"),
      forest = doc.environment!.forest!;
    expect(validateVectorForest(doc)).toEqual([]);
    expect(forest.areaM2).toBeGreaterThan(0.3 * doc.frame.extentMeters ** 2);
    expect(area(regionBoolean(forest.regions, doc.site!.domain, "intersection"))).toBeLessThan(1);
    const roads = Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(pathSurface);
    expect(area(regionBoolean(forest.regions, roads, "intersection"))).toBeLessThan(1);
    const wall = Object.values(doc.paths).find(p => p.role === "wall")!;
    expect(area(regionBoolean(forest.regions, [pathSurface(wall)], "intersection"))).toBeLessThan(1);
    // Reserved sites, such as the windmills' sail sweep, stay open.
    for (const m of doc.environment!.landmarks?.windmills ?? [])
      expect(
        area(regionBoolean(forest.regions, [{ outer: windmillSweep(m), holes: [] }], "intersection"))
      ).toBeLessThan(1);
    const city = generateVectorUrban(doc, { ...DEFAULT_VECTOR_URBAN, population: 3000, lotOccupancy: 1 });
    expect(city.environment?.forest).toEqual(forest);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});
