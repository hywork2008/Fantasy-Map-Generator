import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton, TOWN_MOAT_ID } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };
function city(seed: string) {
  const settings = {
      ...defaultGenerationSettings(),
      population: defaultPopulationSettings(5000),
      moats: { town: true }
    },
    wall = vectorWallChoice(settings, seed, "ageOfExploration"),
    skeleton = generateVectorSkeleton(vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }), {
      ...DEFAULT_VECTOR_GENERATION,
      seed,
      ...wall
    });
  return {
    wall,
    skeleton,
    urban: generateVectorUrban(skeleton.document, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 })
  };
}

describe("meshless town moat from the mesh editor's settings (feature parity P4c-2)", () => {
  it("rings the outer wall with a wet moat bridged on every road, and houses everyone", () => {
    const { wall, urban } = city("m3");
    expect(wall.townMoat).toBe(true);
    const moat = urban.paths[TOWN_MOAT_ID];
    expect(moat.role).toBe("river");
    expect(moat.width.leftMeters + moat.width.rightMeters).toBe(12);
    const bridges = Object.values(urban.connections.bridges).filter(b => b.riverAnchor.pathId === TOWN_MOAT_ID);
    expect(bridges.length).toBeGreaterThanOrEqual(3);
    // No road surface over the moat is left without a deck, and no house stands in it.
    expect(regionBoolean([pathSurface(moat)], [pathSurface(urban.paths["auto-wall"])], "intersection")).toHaveLength(0);
    expect(allVectorWater(urban).length).toBeGreaterThan(0);
    expect(urban.urban!.report.unplacedPopulation).toBe(0);
    expect(regionArea(pathSurface(moat))).toBeGreaterThan(0);
  });

  it("keeps the wall without a moat and says so when no turn bridges every road squarely", () => {
    // Seed m19 draws a bastioned outline whose salients meet the roads obliquely at every turn.
    const { skeleton } = city("m19");
    expect(skeleton.document.paths[TOWN_MOAT_ID]).toBeUndefined();
    expect(skeleton.document.generation!.diagnostics.map(d => d.code)).toContain("town-moat-unplaced");
  });
});
