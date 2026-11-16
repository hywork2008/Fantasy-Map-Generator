import { describe, expect, it } from "vitest";
import { BURIAL_CULTURE_PRESETS } from "../../../../data/burialCultures";
import { defaultGenerationSettings } from "../../generation/settings";
import { pointInPolygon, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };
function town(culture: string, rivers: string[]) {
  const seed = "c1",
    settings = {
      ...defaultGenerationSettings(),
      population: defaultPopulationSettings(5000),
      burialProfile: BURIAL_CULTURE_PRESETS[culture]
    };
  settings.config = {
    ...settings.config,
    coast: "none",
    rivers: rivers as never,
    features: { ...settings.config.features, temple: true, walls: true }
  };
  const doc = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
    skeleton = generateVectorSkeleton(doc, {
      ...DEFAULT_VECTOR_GENERATION,
      seed,
      ...vectorWallChoice(settings, seed, "lateMedieval")
    }).document;
  return { skeleton, cemetery: skeleton.environment?.features["feature:civic-cemetery"] };
}

describe("cemeteries sited by burial culture (feature parity P6a)", () => {
  it("lays a roadside necropolis outside the walls, beside an approach road, for an extramural culture", () => {
    const { skeleton, cemetery } = town("roman_via_appia", []),
      center = polygonCentroid(cemetery!.boundary.outer),
      wall = Object.values(skeleton.paths).find(p => p.role === "wall")!;
    expect(
      pointInPolygon(
        center,
        samplePath(wall).map(s => s.point)
      )
    ).toBe(false);
    expect(skeleton.environment?.landscape?.cemeteries[0].burialProfile?.id).toBe("roman_via_appia");
    // Alongside a road, not cut by one.
    for (const road of Object.values(skeleton.paths).filter(p => p.role === "road"))
      expect(
        regionBoolean([cemetery!.boundary], [pathSurface(road)], "intersection").reduce((n, r) => n + regionArea(r), 0)
      ).toBeLessThan(1e-3);
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 });
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });

  it("puts a ghat on the river bank, and says so when the town has no river", () => {
    const { skeleton, cemetery } = town("varanasi_ghat", ["through"]),
      river = Object.values(skeleton.paths).find(p => p.role === "river")!,
      course = samplePath(river).map(s => s.point),
      // Its river side stands on the bank, a few metres from the water.
      gap = Math.min(
        ...cemetery!.boundary.outer.flatMap(p => course.slice(1).map((b, i) => pointSegmentDistance(p, course[i], b)))
      );
    expect(gap - river.width.leftMeters).toBeLessThan(6);
    const dry = town("varanasi_ghat", []);
    expect(dry.cemetery).toBeUndefined();
    expect(dry.skeleton.generation!.diagnostics.map(d => d.code)).toContain("cemetery-unplaced");
  });
});
