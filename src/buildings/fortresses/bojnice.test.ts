import * as THREE from "three";
import { expect, it } from "vitest";
import { BOJNICE, bojnicePlan, createBojnice } from "./bojnice";

it("keeps the courtyard and entrance open within the advertised study envelope", () => {
  const model = createBojnice();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.max.y).toBeLessThanOrEqual(BOJNICE.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(BOJNICE.width);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(BOJNICE.depth);
  const court = new THREE.Raycaster(new THREE.Vector3(0, 80, 8), new THREE.Vector3(0, -1, 0));
  expect(court.intersectObjects(model.pickables)[0].point.y).toBeCloseTo(5.25);
  const gate = new THREE.Raycaster(new THREE.Vector3(-9, 7, 35), new THREE.Vector3(0, 0, -1), 0, 10);
  expect(gate.intersectObjects(model.pickables)).toHaveLength(0);
  expect(bojnicePlan(model)).not.toMatch(/NaN|Infinity/);
  model.dispose();
});
