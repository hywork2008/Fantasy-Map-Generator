import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { placementDefinition, placementFootprint } from "../placementModels";
import { createOpusSmithy, OPUS_SMITHY } from "./opusSmithy";

const triangles = (model: CityStructureMeshes) => {
  let n = 0;
  model.group.traverse(o => {
    const g = (o as THREE.Mesh).geometry;
    if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return n;
};

function measure(quality: "low" | "high") {
  const model = createOpusSmithy(quality);
  try {
    model.group.updateMatrixWorld(true);
    // The way in from the road, through the yard and the open front to the anvil, above the ground.
    const way = new THREE.Box3(new THREE.Vector3(-0.6, 0.1, -0.4), new THREE.Vector3(0.6, 1.9, OPUS_SMITHY.depth / 2));
    const blocking: number[][] = [];
    model.group.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry,
        pos = g.attributes.position,
        index = g.index,
        count = index ? index.count : pos.count,
        corner = (i: number) =>
          new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      for (let i = 0; i < count; i += 3) {
        const t = new THREE.Triangle(corner(i), corner(i + 1), corner(i + 2));
        if (way.intersectsTriangle(t)) blocking.push(t.getMidpoint(new THREE.Vector3()).toArray());
      }
    });
    return { box: new THREE.Box3().setFromObject(model.group, true), triangles: triangles(model), blocking };
  } finally {
    model.dispose();
  }
}

describe("Opus smithy (docs/plan/ce-outskirts-workshop-sizes.md S2)", () => {
  it("stays inside its 10 x 8 m envelope at both tiers, the same height, open from the road, on a small budget", () => {
    const low = measure("low"),
      high = measure("high");
    for (const { box, blocking } of [low, high]) {
      expect(box.min.x).toBeGreaterThanOrEqual(-OPUS_SMITHY.width / 2 - 0.01);
      expect(box.max.x).toBeLessThanOrEqual(OPUS_SMITHY.width / 2 + 0.01);
      expect(box.min.z).toBeGreaterThanOrEqual(-OPUS_SMITHY.depth / 2 - 0.01);
      expect(box.max.z).toBeLessThanOrEqual(OPUS_SMITHY.depth / 2 + 0.01);
      expect(box.min.y).toBeGreaterThan(-0.01);
      expect(blocking).toEqual([]);
    }
    expect(high.box.max.y).toBeCloseTo(low.box.max.y, 5);
    expect(low.triangles).toBeLessThanOrEqual(3000);
    expect(high.triangles).toBeLessThanOrEqual(9000);
  });

  it("is the model CE places, on its envelope and door", () => {
    const id = "trade-workshop.dedicated-smithy",
      footprint = placementFootprint(id, "low")!;
    expect(footprint.halfX * 2).toBeCloseTo(OPUS_SMITHY.width, 5);
    expect(footprint.halfZ * 2).toBeCloseTo(OPUS_SMITHY.depth, 5);
    expect(placementDefinition(id, "low")?.variant).toContain("claude-opus-5.5");
    expect(placementDefinition(id, "high")?.variant).toContain("claude-opus-5.5");
  });
});
