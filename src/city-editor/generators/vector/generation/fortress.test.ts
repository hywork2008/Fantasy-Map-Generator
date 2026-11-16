import { describe, expect, it } from "vitest";
import { vectorRenderData } from "../../../renderers/vector/renderData";
import type { GenerationSettings } from "../../../types/generation";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { vectorInputFromEditor } from "./editorInput";
import { FORTRESS_WALL_ID } from "./fortress";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };
function settingsFor(fort: Partial<NonNullable<GenerationSettings["townFortification"]>>, rivers = false) {
  const settings: GenerationSettings = {
    ...defaultGenerationSettings(),
    population: defaultPopulationSettings(5000),
    historicalPeriod: "ageOfExploration",
    townFortification: {
      kind: "bastioned",
      outworks: "ravelins",
      ditch: "dry",
      streetPlan: "radial",
      dimensionPolicy: "artillery-v1",
      ...fort
    }
  };
  if (!rivers) settings.config = { ...settings.config, rivers: [] };
  return settings;
}

describe("meshless bastioned town from the mesh editor's fortress planner (feature parity P4c)", () => {
  it("adopts the trace, gates, routes and works as fixed input and houses the town inside", () => {
    const seed = "g0",
      settings = settingsFor({}),
      input = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
      plan = Object.values(input.environment!.defenses!)[0];
    expect(vectorWallChoice(settings, seed, "ageOfExploration")).toEqual({ wall: "none" });
    expect(input.paths[FORTRESS_WALL_ID]).toMatchObject({ role: "wall", editPolicy: "fixed" });
    expect(plan.bastions.length).toBeGreaterThanOrEqual(5);
    expect(plan.outworks.length).toBeGreaterThan(0);
    expect(plan.ditches[0].kind).toBe("dry");
    const civic = plan.accesses.filter(a => a.role === "civic");
    expect(civic.length).toBeGreaterThan(0);
    for (const access of civic) {
      expect(input.connections.gates[access.portal.id]?.wallPathId).toBe(FORTRESS_WALL_ID);
      expect(input.paths[access.roadPathIds[0]].role).toBe("road");
    }
    const skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "none" }).document,
      city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 });
    expect(
      Object.values(city.paths)
        .filter(p => p.role === "wall")
        .map(p => p.id)
    ).toEqual([FORTRESS_WALL_ID]);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
    expect(vectorRenderData(city).surfaces.length).toBeGreaterThan(0);
  });

  it("builds wet ditches and the organic plan, and stops on water it cannot close", () => {
    const wet = vectorInputFromEditor({ settings: settingsFor({ ditch: "wet", outworks: "none" }), seed: "g2", frame });
    expect(Object.values(wet.environment!.defenses!)[0].ditches.every(d => d.kind === "wet")).toBe(true);
    expect(() =>
      vectorInputFromEditor({ settings: settingsFor({ streetPlan: "organic" }), seed: "g3", frame, lotOccupancy: 1 })
    ).not.toThrow();
    // A river through the works needs sluices, which meshless does not adopt yet (P5).
    expect(() => vectorInputFromEditor({ settings: settingsFor({}, true), seed: "g4", frame })).toThrow(
      "fortress-water-conflict"
    );
  });
});
