import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { syntheticVectorInput } from "../../generators/vector/generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { vectorWallChoice } from "../../generators/vector/generation/wallShape";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

const meshesOf = (group: THREE.Object3D) => {
  const out: THREE.Object3D[] = [];
  group.traverse(o => out.push(o));
  return out;
};

describe("meshless bridges and piers as the mesh editor's 3D models (feature parity P2d-3)", () => {
  it("builds each bridge as the modular BV bridge, picked by the bridge, without its massing deck", () => {
    const city = generateVectorSkeleton(syntheticVectorInput("p2-walls", 220, true), {
        ...DEFAULT_VECTOR_GENERATION,
        seed: "p2-walls",
        wall: "ellipse"
      }).document,
      data = vectorRenderData(city, "regions"),
      bridges = data.structures!.filter(s => s.kind === "bridge");
    expect(bridges.length).toBeGreaterThan(0);
    const scene = createVectorScene(data);
    try {
      const all = meshesOf(scene.group),
        holders = all.filter(o => o.userData.representation === "bv-bridge");
      expect(holders.map(h => h.userData.id).sort()).toEqual(bridges.map(b => b.owner).sort());
      expect(all.some(o => o.name === "ce-modular-bridges")).toBe(true);
      expect(all.some(o => o.userData.representation === "structure-massing" && o.userData.kind === "bridge")).toBe(
        false
      );
      scene.group.updateMatrixWorld(true);
      // The deck stands above the land at the datum.
      expect(new THREE.Box3().setFromObject(holders[0]).max.y).toBeGreaterThan(0);
    } finally {
      scene.dispose();
    }
  });

  it("builds harbour piers as the mesh editor's timber piers instead of flat outlines", () => {
    const seed = "w1",
      settings = { ...defaultGenerationSettings(), population: defaultPopulationSettings(5000) };
    settings.config = {
      ...settings.config,
      coast: "bay",
      rivers: [],
      features: { ...settings.config.features, port: true, walls: false }
    };
    const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 },
      doc = generateVectorSkeleton(vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }), {
        ...DEFAULT_VECTOR_GENERATION,
        seed,
        ...vectorWallChoice(settings, seed, "ageOfExploration")
      }).document,
      data = vectorRenderData(doc, "regions");
    expect(data.piers!.length).toBe(doc.environment!.harbor!.piers.length);
    const scene = createVectorScene(data);
    try {
      const all = meshesOf(scene.group);
      expect(all.some(o => o.name === "ce-piers" && o.children.length > 0)).toBe(true);
      expect(all.some(o => o.userData.pieceRole === "pier" && o.userData.representation === "footprint")).toBe(false);
    } finally {
      scene.dispose();
    }
  });
});
