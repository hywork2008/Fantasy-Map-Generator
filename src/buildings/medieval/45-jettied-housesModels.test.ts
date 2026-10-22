import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { models } from "./45-jettied-housesModels";

// Wall braces must terminate on the timber frame rather than in plaster infill.
describe.each(models)("$id wall framing", definition => {
  it("mirrors side bracing and connects jetty brackets to lower posts and upper bressummers", () => {
    const model = definition.create();
    try {
      model.group.updateMatrixWorld(true);
      const boxes = (names: string[]) =>
        model.pickables
          .filter(mesh => names.includes(mesh.name))
          .map(mesh => new THREE.Box3().setFromObject(mesh).expandByScalar(0.01));
      const posts = boxes(["oak-storey-post", "side-frame-post"]);
      const beams = boxes(["jetty-bressummer", "side-jetty-bressummer"]);
      for (const bracket of model.pickables.filter(mesh =>
        ["jetty-bracket", "side-jetty-bracket"].includes(mesh.name)
      )) {
        for (const [end, supports] of [
          [-0.5, posts],
          [0.5, beams]
        ] as const) {
          const point = new THREE.Vector3(0, end, 0).applyMatrix4(bracket.matrixWorld);
          expect(
            supports.some(box => box.containsPoint(point)),
            `${bracket.name}: ${point.toArray()}`
          ).toBe(true);
        }
      }
      const braces = model.pickables.filter(mesh => mesh.name === "side-frame-brace");
      const directions = braces.map(mesh => new THREE.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld).z);
      expect(directions.some(z => z > 0)).toBe(true);
      expect(directions.some(z => z < 0)).toBe(true);
      for (const joist of model.pickables.filter(mesh => mesh.name === "jetty-joist")) {
        const bounds = new THREE.Box3().setFromObject(joist);
        expect(bounds.min.z).toBeLessThanOrEqual(-3);
        expect(bounds.max.z).toBeGreaterThan(3);
      }
    } finally {
      model.dispose();
    }
  });

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
