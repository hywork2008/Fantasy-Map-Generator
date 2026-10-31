import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createDocument } from "../../city-editor/generators/document";
import { forestRegions } from "../../city-editor/generators/forestGeometry";
import { cityTerrain } from "../../city-editor/generators/terrainElevation";
import { ROCK_SLOPE } from "../../city-editor/generators/terrainField/constants";
import type { ForestPlan } from "../../city-editor/types/contracts/forest";
import type { Point } from "../../city-editor/types/document";
import { createForestGroundTexture } from "./forestGroundTexture";
import { terrainFieldMeshes } from "./terrainFieldMesh";

const rectangle = (low: number, high: number): Point[] => [
  [low, low],
  [high, low],
  [high, high],
  [low, high]
];
function fixture() {
  const document = createDocument("forest-ground", 100);
  document.forestSettings = { version: 1, mode: "surroundings", density: "standard" };
  document.terrain = {
    version: 1,
    features: [],
    field: { version: 1, template: "noise", seed: 0, sampleMeters: 10, parts: [{ kind: "offset", meters: 1 }] }
  };
  const regions = forestRegions([{ faceId: "f0", polygon: rectangle(-40, 40) }]);
  regions[0].holes = [rectangle(-8, 8).reverse()];
  const plan: ForestPlan = {
    regions,
    forestFaceIds: ["f0"],
    areaM2: 6144,
    protectedFarmCount: 0,
    protectedFarmAreaM2: 0
  };
  return { document, plan };
}

describe("forest cover on the existing terrain surface", () => {
  it("masks forest boundaries and clearings without painting outside the forest", () => {
    const { document, plan } = fixture();
    const texture = createForestGroundTexture(document, plan);
    const { data, width, height } = texture.image;
    const alpha = (x: number, y: number) =>
      data[(Math.floor((y / 100 + 0.5) * height) * width + Math.floor((x / 100 + 0.5) * width)) * 4 + 3];
    expect(alpha(20, 20)).toBe(255);
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(45, 0)).toBe(0);
    expect(data.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
    texture.dispose();
  });

  it("adds no ground vertices or draw calls and disposes its shared texture with the terrain", () => {
    const { document, plan } = fixture();
    const terrain = cityTerrain(document);
    const plain = terrainFieldMeshes(document, terrain);
    const covered = terrainFieldMeshes(document, terrain, [], plan);
    expect(covered).toHaveLength(plain.length);
    const textures = new Set<THREE.Texture>();
    for (let i = 0; i < covered.length; i++) {
      expect(covered[i].geometry.getAttribute("position").array).toEqual(
        plain[i].geometry.getAttribute("position").array
      );
      expect(covered[i].geometry.index!.array).toEqual(plain[i].geometry.index!.array);
      const material = covered[i].material as THREE.MeshLambertMaterial;
      const shader = { ...THREE.ShaderLib.lambert, uniforms: { ...THREE.ShaderLib.lambert.uniforms } };
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      textures.add(shader.uniforms.ceForestGround.value);
      expect(shader.fragmentShader).toContain("diffuseColor.rgb = mix");
      expect(shader.uniforms.ceForestRockSlope.value.toArray()).toEqual([ROCK_SLOPE * 0.9, ROCK_SLOPE * 1.1]);
    }
    expect(textures.size).toBe(1);
    const disposed = vi.fn();
    [...textures][0].addEventListener("dispose", disposed);
    for (const mesh of [...covered, ...plain]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    expect(disposed).toHaveBeenCalledTimes(1);
  });
});
