import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { vectorRenderData } from "./renderData";
import { createVectorScene, VectorSceneLayers } from "./scene3d";

describe("meshless 3D layers kept between redraws, as the mesh editor's view keeps them", () => {
  it("rebuilds nothing for the same city and only the changed layers after an edit", () => {
    const settings = {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(3000),
        historicalPeriod: "lateMedieval" as const
      },
      city = generateVectorUrban(
        generateVectorSkeleton(
          vectorInputFromEditor({
            settings,
            seed: "layers",
            frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
            lotOccupancy: 1
          }),
          { ...DEFAULT_VECTOR_GENERATION, seed: "layers", wall: "ellipse" }
        ).document,
        { ...DEFAULT_VECTOR_URBAN, population: 3000, lotOccupancy: 1 }
      ),
      layers = new VectorSceneLayers();
    let scene = createVectorScene(vectorRenderData(city, "housing"), { layers });
    try {
      expect(layers.built).toContain("houses");
      const next = createVectorScene(vectorRenderData(structuredClone(city), "housing"), { layers });
      scene.dispose();
      scene = next;
      expect(layers.built).toEqual([]);
      // A look-only edit: the houses (and the stone walls' towers, which follow the culture) are rebuilt, the rest kept.
      const restyled = structuredClone(city);
      restyled.context.requestedSettings = {
        ...restyled.context.requestedSettings!,
        buildingAppearanceProfile: "mediterranean"
      } as typeof restyled.context.requestedSettings;
      const third = createVectorScene(vectorRenderData(restyled, "housing"), { layers });
      scene.dispose();
      scene = third;
      expect(layers.built).toContain("houses");
      expect(layers.built.every(key => key === "houses" || key.startsWith("structure:"))).toBe(true);
      expect(scene.group.children.length).toBeGreaterThan(0);
      // Turning the town's simplification off (the mesh editor's preference) rebuilds the houses without the LOD budget.
      const full = createVectorScene(vectorRenderData(restyled, "housing"), {
        layers,
        simplification: { urban: "off", outskirts: "auto" }
      });
      scene.dispose();
      scene = full;
      expect(layers.built).toEqual(["houses"]);
    } finally {
      scene.dispose();
      layers.dispose();
    }
  });
});
