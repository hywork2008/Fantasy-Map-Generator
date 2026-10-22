import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { models } from "./45-jettied-housesModels";

// Wall braces must terminate on the timber frame rather than in plaster infill.
describe.each(models)("$id wall framing", definition => {
  it("connects both ends of every wall brace to posts or rails", () => {
    const model = definition.create();
    try {
      model.group.updateMatrixWorld(true);
      const supports = model.pickables
        .filter(mesh => /^(oak-storey|side-storey|side-frame-post|window-frame)/.test(mesh.name))
        .map(mesh => new THREE.Box3().setFromObject(mesh).expandByScalar(0.01));
      const braces = model.pickables.filter(mesh => ["diagonal-frame-brace", "side-frame-brace"].includes(mesh.name));
      expect(braces.length).toBeGreaterThan(0);
      for (const brace of braces) {
        for (const end of [-0.5, 0.5]) {
          const point = new THREE.Vector3(0, end, 0).applyMatrix4(brace.matrixWorld);
          expect(
            supports.some(box => box.containsPoint(point)),
            `${brace.name}: ${point.toArray()}`
          ).toBe(true);
        }
      }
    } finally {
      model.dispose();
    }
  });
});
