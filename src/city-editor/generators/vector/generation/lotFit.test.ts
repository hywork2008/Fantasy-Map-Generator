import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { regionArea, regionBoolean } from "../geometry/regions";
import { sampledClosedRing } from "../geometry/routing";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";

describe("CE lots trimmed of the slivers they share with their neighbours (pre-acceptance U3)", () => {
  it("builds every lot inside the wall when the town needs more than it holds", () => {
    // A lot trimmed of a sliver and rounded to the centimetre could still lap its neighbour by a few square
    // centimetres, and stayed empty: one lot in seven inside the wall, 14% of the land with every lot wanted.
    const seed = "lot-fit",
      settings = {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(3000),
        historicalPeriod: "lateMedieval" as const,
        buildingPattern: "medieval" as const,
        // A straight river, as the default `through` river was when this case was set (it is now a gentle meander,
        // docs/plan/ce-outskirts-workshop-sizes.md §8.21).
        config: { ...defaultGenerationSettings().config, riverForms: ["straight" as const] }
      },
      input = vectorInputFromEditor({
        settings,
        seed,
        frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
        lotOccupancy: 1
      }),
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document,
      // Six times the people the wall was sized for: every lot inside it is wanted.
      city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 18000, lotOccupancy: 1 }),
      circuit = Object.values(city.connections.circuits).find(c => !c.parentCircuitId)!,
      wall = [{ outer: sampledClosedRing(city, circuit.pathId), holes: [] }],
      vacant = regionBoolean(city.urban!.residualLand, wall, "intersection").reduce((n, r) => n + regionArea(r), 0);
    expect(vacant / regionArea(wall[0])).toBeLessThan(0.08);
  }, 300000);
});
