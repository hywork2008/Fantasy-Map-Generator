import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { containsRegion } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };
function city(layout: "circulade" | "bram", seed = "c4") {
  const settings = {
      ...defaultGenerationSettings(),
      population: defaultPopulationSettings(5000),
      layout,
      townWallRings: "double" as const
    },
    wall = vectorWallChoice(settings, seed, "ageOfExploration", frame.extentMeters),
    skeleton = generateVectorSkeleton(vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }), {
      ...DEFAULT_VECTOR_GENERATION,
      seed,
      ...wall
    }).document;
  return { wall, urban: generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 }) };
}

describe("meshless concentric town plans from the mesh editor's planners (feature parity P4d)", () => {
  it("resolves the layout as the mesh editor does and keeps one wall", () => {
    const settings = { ...defaultGenerationSettings(), layout: "auto" as const };
    expect(vectorWallChoice(settings, "s", "lateMedieval", 1200).layout).toBeUndefined();
    const small = Array.from({ length: 12 }, (_, i) => vectorWallChoice(settings, `s${i}`, "lateMedieval", 600).layout);
    expect(new Set(small)).toEqual(new Set([undefined, "circulade", "bram"]));
    expect(city("circulade").wall.innerWall).toBeUndefined();
  });

  for (const layout of ["circulade", "bram"] as const)
    it(`lays ${layout} rings, spokes and a through street inside the town and houses everyone`, () => {
      const { urban } = city(layout),
        lines = (prefix: string) => Object.values(urban.paths).filter(p => p.id.startsWith(prefix));
      expect(lines("auto-ring:").length).toBeGreaterThan(2);
      expect(lines("auto-spoke:").length).toBeGreaterThan(1);
      expect(lines("auto-through:").length).toBeGreaterThan(0);
      for (const p of [...lines("auto-ring:"), ...lines("auto-spoke:")])
        expect(samplePath(p).every(s => containsRegion(urban.site!.domain, s.point))).toBe(true);
      expect(urban.urban!.report.unplacedPopulation).toBe(0);
    });
});
