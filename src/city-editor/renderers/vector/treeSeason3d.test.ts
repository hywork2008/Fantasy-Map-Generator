import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { treeSeason } from "../../../city3d/treeSeason";
import goth from "../../data/fixtures/gothengsfeld-20261012.json";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { vectorInputFromDescriptor } from "../../generators/vector/generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

describe("meshless trees with the mesh editor's tree LOD and seasons (feature parity P2d-8)", () => {
  it("passes the FMG burg's month and climate to the trees' seasonal look", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor;
    // Midwinter: deciduous park trees are bare, unlike the default model.
    d.date = { year: 1, month: 1 } as BurgSiteDescriptor["date"];
    d.climate = { ...d.climate, monthlyMeanTemperatureC: [-2, 0, 4, 9, 14, 17, 19, 18, 14, 9, 4, 0] };
    const doc = generateVectorSkeleton(vectorInputFromDescriptor(d), {
        ...DEFAULT_VECTOR_GENERATION,
        seed: "p"
      }).document,
      data = vectorRenderData(doc, "regions"),
      season = treeSeason(data.seasonDescriptor, "descriptor", { latitude: 45, month: 7 });
    expect(season?.month).toBe(1);
    expect(season?.look("garden_parkland")).toBeDefined();
  });

  it("switches park trees by the camera with the open spaces' tree LOD", () => {
    const seed = "p7c-f",
      input = vectorInputFromEditor({
        settings: {
          ...defaultGenerationSettings(),
          population: defaultPopulationSettings(3000),
          historicalPeriod: "lateMedieval" as const,
          buildingPattern: "medieval" as const
        },
        seed,
        frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
        lotOccupancy: 1
      }),
      doc = generateVectorUrban(
        generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document,
        { ...DEFAULT_VECTOR_URBAN, population: 3000, lotOccupancy: 1 }
      ),
      data = vectorRenderData(doc, "housing"),
      scene = createVectorScene(data);
    try {
      const tree = (data.openSpaces?.sites ?? []).find(s => s.radius !== undefined)!,
        camera = new THREE.PerspectiveCamera(40, 1.5, 1, 20000);
      camera.position.set(tree.point[0] + 15, 12, -tree.point[1] + 15);
      camera.lookAt(tree.point[0], 0, -tree.point[1]);
      camera.updateMatrixWorld(true);
      scene.updateCamera(camera, 900);
      const lod: THREE.Object3D[] = [];
      scene.group.traverse(o => {
        if (o.name.startsWith("open-space-lod-")) lod.push(o);
      });
      expect(lod.length).toBeGreaterThan(0);
    } finally {
      scene.dispose();
    }
  });
});
