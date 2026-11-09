import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { regionArea } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };
function city(extra: Record<string, unknown>, seed = "d0") {
  const settings = {
      ...defaultGenerationSettings(),
      population: defaultPopulationSettings(5000),
      townWallRings: "double" as const,
      ...extra
    },
    wall = vectorWallChoice(settings, seed, "ageOfExploration"),
    input = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
    skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall });
  return {
    wall,
    skeleton,
    urban: generateVectorUrban(skeleton.document, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 })
  };
}
const area = (doc: ReturnType<typeof city>["urban"], id: string) =>
  regionArea({ outer: samplePath(doc.paths[id]).map(s => s.point), holes: [] });

describe("meshless double walls from the mesh editor's settings (feature parity P4b)", () => {
  it("walls an old town of the walled share inside the outer wall, with gates on its streets", () => {
    const { wall, urban } = city({});
    expect(wall.innerWall).toEqual({ share: 0.45, state: "standing" });
    const inner =
      urban.connections.circuits[
        Object.values(urban.connections.circuits).find(c => c.pathId === "auto-inner-wall")!.id
      ];
    expect(urban.connections.circuits[inner.parentCircuitId!].pathId).toBe("auto-wall");
    // Eased by a few percent to meet the streets cleanly.
    expect(area(urban, "auto-inner-wall") / area(urban, "auto-wall")).toBeGreaterThan(0.3);
    expect(area(urban, "auto-inner-wall") / area(urban, "auto-wall")).toBeLessThan(0.65);
    expect(
      Object.values(urban.connections.gates).filter(g => g.wallPathId === "auto-inner-wall" && g.kind === "passage")
        .length
    ).toBeGreaterThan(2);
    expect(urban.urban!.report.unplacedPopulation).toBe(0);
  });

  it("builds the old town first through the approaches, and razes its wall to a boulevard", () => {
    const first = city({ townWallBuildOrder: "inner-first" }).urban;
    expect(first.paths["auto-inner-wall"]?.role).toBe("wall");
    expect(first.urban!.report.unplacedPopulation).toBe(0);
    const razed = city({ innerWallState: "razed" }).urban,
      boulevards = Object.values(razed.paths).filter(p => p.id.startsWith("auto-boulevard:"));
    expect(razed.paths["auto-inner-wall"]).toBeUndefined();
    expect(Object.values(razed.paths).filter(p => p.role === "wall")).toHaveLength(1);
    expect(boulevards.length).toBeGreaterThan(0);
    for (const b of boulevards) expect(b.role).toBe("road");
    expect(razed.urban!.report.unplacedPopulation).toBe(0);
  });

  it("keeps the outer wall alone and says so when no old-town line takes gates cleanly", () => {
    // Seed d3 draws a bastioned outline; its old-town line meets the streets at its corners at every size tried.
    const { skeleton } = city({}, "d3");
    expect(skeleton.document.paths["auto-inner-wall"]).toBeUndefined();
    expect(skeleton.document.generation!.diagnostics.map(d => d.code)).toContain("inner-wall-unplaced");
  });
});
