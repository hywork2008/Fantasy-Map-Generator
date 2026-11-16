import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { models } from "../medieval/60-churchyard-furnitureModels";

describe("churchyard furniture", () => {
  it.each(models)("$id stands on the ground within its declared size at both qualities", model => {
    for (const variant of model.variants!) {
      const built = variant.create();
      built.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(built.group, true),
        size = box.getSize(new THREE.Vector3());
      expect(box.min.y, `${variant.level} base`).toBeCloseTo(0, 1);
      expect(size.x, `${variant.level} width`).toBeCloseTo(model.size[0], 0);
      expect(size.z, `${variant.level} depth`).toBeCloseTo(model.size[1], 0);
      expect(size.y, `${variant.level} height`).toBeCloseTo(model.size[2], 0);
      built.dispose();
    }
  });
});
