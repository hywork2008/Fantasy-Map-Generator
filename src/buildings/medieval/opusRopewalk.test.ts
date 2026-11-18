import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { placementDefinition, placementFootprint } from "../placementModels";
import { createOpusRopewalk, OPUS_ROPEWALK } from "./opusRopewalk";

const triangles = (model: CityStructureMeshes) => {
  let n = 0;
  model.group.traverse(o => {
    const g = (o as THREE.Mesh).geometry;
    if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return n;
};

function measure(quality: "low" | "high") {
  const model = createOpusRopewalk(quality);
  try {
    return { box: new THREE.Box3().setFromObject(model.group, true), triangles: triangles(model) };
  } finally {
    model.dispose();
  }
}

describe("Opus ropewalk (docs/plan/opus-ropewalk.md)", () => {
  it("stays inside the CE plot of the earlier study at both tiers, the same height, on a small budget", () => {
    const low = measure("low"),
      high = measure("high");
    for (const { box } of [low, high]) {
      expect(box.min.x).toBeGreaterThanOrEqual(-OPUS_ROPEWALK.width / 2 - 0.01);
      expect(box.max.x).toBeLessThanOrEqual(OPUS_ROPEWALK.width / 2 + 0.01);
      expect(box.min.z).toBeGreaterThanOrEqual(-OPUS_ROPEWALK.depth / 2 - 0.01);
      expect(box.max.z).toBeLessThanOrEqual(OPUS_ROPEWALK.depth / 2 + 0.01);
      expect(box.min.y).toBeGreaterThan(-0.01);
    }
    expect(high.box.max.y).toBeCloseTo(low.box.max.y, 5);
    expect(low.triangles).toBeLessThanOrEqual(3000);
    expect(high.triangles).toBeLessThanOrEqual(9000);
  });

  it("is the model CE places, on the same envelope and door", () => {
    const id = "trade-workshop.dedicated-ropewalk",
      footprint = placementFootprint(id, "low")!;
    expect(footprint.halfX * 2).toBeCloseTo(OPUS_ROPEWALK.width, 5);
    expect(footprint.halfZ * 2).toBeCloseTo(OPUS_ROPEWALK.depth, 5);
    expect(placementDefinition(id, "low")?.variant).toContain("claude-opus-5.5");
    expect(placementDefinition(id, "high")?.variant).toContain("claude-opus-5.5");
  });
});
