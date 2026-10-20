import * as THREE from "three";
import { expect, it } from "vitest";
import { CHAMBORD, createChambord } from "./chambord";

it("preserves the open court and gate, symmetric massing and tallest central lantern", () => {
  const model = createChambord();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.max.y).toBeLessThanOrEqual(CHAMBORD.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(CHAMBORD.width);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(CHAMBORD.depth);
  expect(bounds.min.x).toBeCloseTo(-bounds.max.x);
  const down = (x: number, z: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0)).intersectObjects(model.pickables)[0]
      .point.y;
  expect(down(0, 32)).toBeCloseTo(0.4);
  expect(down(0, -22)).toBeCloseTo(bounds.max.y);
  const gate = new THREE.Raycaster(new THREE.Vector3(0, 2, 75), new THREE.Vector3(0, 0, -1), 0, 22);
  expect(gate.intersectObjects(model.pickables)).toHaveLength(0);
  expect(model.plan).not.toMatch(/NaN|Infinity/);
  model.dispose();
});
