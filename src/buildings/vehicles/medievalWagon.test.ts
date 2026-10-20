import * as THREE from "three";
import { expect, it } from "vitest";
import { createMedievalWagon, MEDIEVAL_WAGON } from "./medievalWagon";

it("grounds all four wheels, clears the load bed and leaves its interior open", () => {
  const model = createMedievalWagon();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(MEDIEVAL_WAGON.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(MEDIEVAL_WAGON.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(MEDIEVAL_WAGON.width);
  const tires = model.pickables.filter(mesh => mesh.name === "wheel-iron-tire");
  expect(tires).toHaveLength(4);
  for (const tire of tires) {
    const wheel = new THREE.Box3().setFromObject(tire);
    expect(wheel.min.y).toBeCloseTo(0);
    for (const part of model.pickables.filter(mesh => /^(floor-plank|side-plank|side-stake)$/.test(mesh.name))) {
      expect(wheel.intersectsBox(new THREE.Box3().setFromObject(part))).toBe(false);
    }
  }
  const ray = new THREE.Raycaster(new THREE.Vector3(-0.6, 3, 0), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(model.pickables)[0];
  expect(hit.object.name).toBe("floor-plank");
  expect(hit.point.y).toBeCloseTo(1.18);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.elevation).toContain("<path");
  expect(model.plan).toContain("<path");
  model.dispose();
});
