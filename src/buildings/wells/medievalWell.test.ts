import * as THREE from "three";
import { expect, it } from "vitest";
import { createMedievalWell, MEDIEVAL_WELL } from "./medievalWell";

it("leaves the shaft open and suspends the bucket below the windlass with clearance", () => {
  const model = createMedievalWell();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(MEDIEVAL_WELL.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(MEDIEVAL_WELL.width);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(MEDIEVAL_WELL.depth);
  const stones = model.pickables.filter(mesh => ["curb-stone", "coping-stone"].includes(mesh.name));
  const ray = new THREE.Raycaster(new THREE.Vector3(-0.4, 1.2, 0), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObjects(stones)).toHaveLength(0);
  expect(ray.intersectObject(model.group.getObjectByName("shaft-water")!)).toHaveLength(1);
  const bucket = model.pickables.filter(mesh => mesh.name.startsWith("bucket-"));
  const bucketBounds = new THREE.Box3();
  for (const part of bucket) bucketBounds.union(new THREE.Box3().setFromObject(part));
  expect(bucketBounds.min.y).toBeGreaterThan(0.025);
  expect(bucketBounds.max.y).toBeLessThan(1.8);
  for (const x of [bucketBounds.min.x, bucketBounds.max.x]) {
    for (const z of [bucketBounds.min.z, bucketBounds.max.z]) expect(Math.hypot(x, z)).toBeLessThan(0.69);
  }
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.elevation).toContain("<path");
  model.dispose();
});
