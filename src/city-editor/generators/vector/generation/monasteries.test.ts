import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { featureReservations } from "../environmentState";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { validateVectorMonasteries } from "../monastery";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };

describe("religious houses by the mesh editor's precinct rules (feature parity P6c)", () => {
  it("founds an abbey and a friary in a Latin town of 8,000 and keeps the houses off their precincts", () => {
    const seed = "k1",
      settings = {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(8000),
        historicalPeriod: "lateMedieval" as const
      };
    settings.config = {
      ...settings.config,
      coast: "none",
      rivers: [],
      features: { ...settings.config.features, walls: false }
    };
    const skeleton = generateVectorSkeleton(vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }), {
        ...DEFAULT_VECTOR_GENERATION,
        seed,
        ...vectorWallChoice(settings, seed, "lateMedieval")
      }).document,
      houses = Object.values(skeleton.environment?.monasteries ?? {});
    expect(houses.map(h => h.kind).sort()).toEqual(["abbey", "friary"]);
    expect(validateVectorMonasteries(skeleton)).toEqual([]);
    const roads = Object.values(skeleton.paths)
      .filter(p => p.role === "road")
      .map(pathSurface);
    for (const h of houses) {
      expect(h.buildings.some(b => b.role === "church")).toBe(true);
      expect(
        regionBoolean([{ outer: h.precinct, holes: [] }], roads, "intersection").reduce((n, r) => n + regionArea(r), 0)
      ).toBeLessThan(1e-3);
    }
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 8000, lotOccupancy: 1 });
    expect(city.environment?.monasteries).toEqual(skeleton.environment?.monasteries);
    expect(featureReservations(city).length).toBeGreaterThan(0);
    const houseLots = Object.values(city.placements).filter(p => p.display?.kind === "housing");
    for (const h of houses)
      for (const lot of houseLots)
        expect(
          regionBoolean([{ outer: h.precinct, holes: [] }], [lot.site], "intersection").reduce(
            (n, r) => n + regionArea(r),
            0
          )
        ).toBeLessThan(0.5);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});
