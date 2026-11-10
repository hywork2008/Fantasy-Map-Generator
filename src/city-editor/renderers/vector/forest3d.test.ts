import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

describe("meshless woodland as the mesh editor's forest (feature parity P2d-6)", () => {
  it("draws the forest floor, crowns and near trees instead of the flat woodland surface", () => {
    const settings = {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(3000),
        historicalPeriod: "lateMedieval" as const,
        buildingPattern: "medieval" as const,
        forestSettings: { version: 1 as const, mode: "surroundings" as const, density: "standard" as const }
      },
      seed = "p7b-forest",
      doc = generateVectorSkeleton(
        vectorInputFromEditor({
          settings,
          seed,
          frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
          lotOccupancy: 1
        }),
        { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }
      ).document,
      data = vectorRenderData(doc, "regions");
    expect(data.forest?.regions.length).toBeGreaterThan(0);
    const scene = createVectorScene(data);
    try {
      const all: THREE.Object3D[] = [];
      scene.group.traverse(o => all.push(o));
      const forest = all.find(o => o.name === "ce-forest")!;
      expect(forest).toBeDefined();
      expect(all.some(o => o.userData.id === "environment:forest" && o.userData.representation === "footprint")).toBe(
        false
      );
      // A camera at the forest edge brings in the near trees.
      const r = data.forest!.regions[0].outer[0],
        camera = new THREE.PerspectiveCamera(40, 1.5, 1, 20000);
      camera.position.set(r[0] + 30, 25, -r[1] + 30);
      camera.lookAt(r[0], 0, -r[1]);
      camera.updateMatrixWorld(true);
      scene.updateCamera(camera, 900);
      let meshes = 0;
      forest.traverse(o => {
        if (o instanceof THREE.Mesh) meshes++;
      });
      expect(meshes).toBeGreaterThan(0);
      scene.group.updateMatrixWorld(true);
      expect(new THREE.Box3().setFromObject(forest).max.y).toBeGreaterThan(2);
    } finally {
      scene.dispose();
    }
  });
});
