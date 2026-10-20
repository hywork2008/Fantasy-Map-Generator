import * as THREE from "three";
import { expect, it } from "vitest";
import { createNobleCarriage, NOBLE_CARRIAGE } from "./nobleCarriage";

it("keeps the covered passenger compartment hollow and the boarding steps clear of grounded wheels", () => {
  const model = createNobleCarriage();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(NOBLE_CARRIAGE.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(NOBLE_CARRIAGE.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(NOBLE_CARRIAGE.width);
  const tires = model.pickables.filter(mesh => mesh.name === "wheel-iron-tire");
  expect(tires).toHaveLength(4);
  const steps = model.pickables.filter(mesh => mesh.name === "boarding-step");
  expect(steps).toHaveLength(4);
  for (const tire of tires) {
    const wheelBounds = new THREE.Box3().setFromObject(tire);
    expect(wheelBounds.min.y).toBeCloseTo(0);
    for (const step of steps) expect(wheelBounds.intersectsBox(new THREE.Box3().setFromObject(step))).toBe(false);
  }
  const throughWindow = new THREE.Raycaster(new THREE.Vector3(-0.6, 2.3, 3), new THREE.Vector3(0, 0, -1));
  expect(throughWindow.intersectObjects(model.pickables)).toHaveLength(0);
  const belowCanopy = new THREE.Raycaster(new THREE.Vector3(-0.6, 2.3, 0), new THREE.Vector3(0, 1, 0));
  expect(belowCanopy.intersectObjects(model.pickables)[0].object.name).toBe("canopy-lining");
  expect(model.pickables.filter(mesh => mesh.name === "passenger-seat-cushion")).toHaveLength(2);
  const platform = new THREE.Box3().setFromObject(model.group.getObjectByName("driver-platform")!);
  for (const support of model.pickables.filter(mesh => mesh.name === "bench-support")) {
    expect(platform.intersectsBox(new THREE.Box3().setFromObject(support))).toBe(true);
  }
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.elevation).toContain("<path");
  expect(model.plan).toContain("<path");
  model.dispose();
});
