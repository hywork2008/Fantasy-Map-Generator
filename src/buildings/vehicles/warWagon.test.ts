import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createWarWagon, createWarWagonModel, WAR_WAGON } from "./warWagon";

it("grounds four wheels, clears the body and provides real firing apertures and an open compartment", () => {
  const model = createWarWagon();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(WAR_WAGON.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(WAR_WAGON.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(WAR_WAGON.width);
  const wheels = model.pickables.filter(mesh => mesh.name === "wheel-iron-tire");
  expect(wheels).toHaveLength(4);
  const body = model.pickables.filter(mesh => /^(floor-plank|defensive-side-plank|wall-stake)$/.test(mesh.name));
  for (const wheel of wheels) {
    const box = new THREE.Box3().setFromObject(wheel);
    expect(box.min.y).toBeCloseTo(0);
    for (const part of body) expect(box.intersectsBox(new THREE.Box3().setFromObject(part))).toBe(false);
  }
  for (const x of [-1.5, -0.5, 0.5, 1.5]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 2.36, 3), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObjects(model.pickables)).toHaveLength(0);
    ray.set(new THREE.Vector3(x, 2.78, 3), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObjects(model.pickables)[0].object.name).toBe("defensive-side-plank");
  }
  const top = new THREE.Raycaster(new THREE.Vector3(0.2, 4, 0), new THREE.Vector3(0, -1, 0));
  const hit = top.intersectObjects(model.pickables)[0];
  expect(hit.object.name).toBe("floor-plank");
  expect(hit.point.y).toBeCloseTo(1.33);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).toContain("<path");
  expect(model.plan).not.toBe(model.elevation);
  model.dispose();
});

it("disposes shared geometry and materials once when switching models", () => {
  const model = createWarWagonModel();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of model.pickables) {
    resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) resources.add(material);
  }
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});
