import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

describe("meshless park trees and wells as the mesh editor's 3D models (feature parity P2d-1)", () => {
  it("stands park trees as species models and wells as BV waterworks, not flat discs", () => {
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
      // Park trees are open-space tree sites since P2d-8, for the camera tree LOD and seasons.
      parkTrees = (data.openSpaces?.sites ?? []).filter(t => t.radius !== undefined && !t.footprint),
      wells = data.wells ?? [];
    expect(parkTrees.length).toBe(doc.urban!.parks!.reduce((n, p) => n + p.trees.length, 0));
    expect(parkTrees.length).toBeGreaterThan(0);
    expect(wells.length).toBeGreaterThan(0);
    const scene = createVectorScene(data);
    try {
      const flat: string[] = [];
      let wellLayer: THREE.Object3D | undefined;
      scene.group.traverse(o => {
        if (o.name === "ce-wells") wellLayer = o;
        const role = o.userData?.pieceRole;
        if (o.userData?.representation === "footprint" && (role === "bv-well" || role === "landscape-tree"))
          flat.push(o.userData.id);
      });
      expect(wellLayer).toBeDefined();
      expect(flat).toEqual([]);
    } finally {
      scene.dispose();
    }
  });
});
