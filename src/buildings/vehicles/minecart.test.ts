import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createMinecart, createMinecartModel, MINECART } from "./minecart";

it("seats four wheel treads on the rails with inside flanges and an open load box", () => {
  const model = createMinecart();
  model.group.updateMatrixWorld(true);
  const parts = (name: string) => model.pickables.filter(mesh => mesh.name === name);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(MINECART.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(MINECART.length);
  expect(bounds.max.z - bounds.min.z).toBeCloseTo(MINECART.width);
  expect(parts("wheel-tread")).toHaveLength(4);
  expect(parts("wheel-flange")).toHaveLength(4);
  const rails = parts("rail-head").map(mesh => new THREE.Box3().setFromObject(mesh));
  for (const wheel of parts("wheel-tread")) {
    const wheelBounds = new THREE.Box3().setFromObject(wheel);
    const rail = rails.find(rail => wheelBounds.min.z < rail.max.z && wheelBounds.max.z > rail.min.z)!;
    expect(rail).toBeDefined();
    expect(wheelBounds.min.y).toBeCloseTo(rail.max.y);
    for (const plank of parts("floor-plank")) {
      expect(wheelBounds.intersectsBox(new THREE.Box3().setFromObject(plank))).toBe(false);
    }
  }
  for (const flange of parts("wheel-flange")) {
    const flangeBounds = new THREE.Box3().setFromObject(flange);
    for (const rail of rails) expect(flangeBounds.intersectsBox(rail)).toBe(false);
  }
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(model.pickables)[0];
  expect(hit.object.name).toBe("floor-plank");
  expect(hit.point.y).toBeCloseTo(0.75);
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).toContain("<path");
  model.dispose();
});

it("releases shared geometry and materials once", () => {
  const model = createMinecartModel();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of model.pickables) {
    resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) resources.add(material);
  }
  const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
});
