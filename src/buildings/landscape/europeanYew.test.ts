import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createLandscapeTree } from "./trees";

it("builds a broad, grounded evergreen with a covered crown and two render batches", () => {
  const model = createLandscapeTree("sacred_yew");
  expect(model.group.name).toBe("european-yew");
  expect(model.pickables).toHaveLength(2);
  const bounds = new THREE.Box3().setFromObject(model.group);
  const size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(-0.35, 3);
  expect(size.x).toBeGreaterThan(size.y);
  expect(size.y).toBeGreaterThan(7);
  expect(size.x).toBeLessThan(12);
  model.group.updateMatrixWorld(true);
  const triangleCount = model.pickables.reduce(
    (sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3,
    0
  );
  expect(triangleCount).toBeLessThan(35000);
  const crown = model.pickables[1];
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 12, 0), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(crown);
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0].point.y).toBeGreaterThan(6);
  for (const mesh of model.pickables) {
    expect(mesh.geometry.getAttribute("color").count).toBe(mesh.geometry.getAttribute("position").count);
  }
  const spies = model.pickables.flatMap(mesh => [
    vi.spyOn(mesh.geometry, "dispose"),
    vi.spyOn(mesh.material as THREE.Material, "dispose")
  ]);
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});
