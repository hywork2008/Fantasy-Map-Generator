import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { createMedievalWell, MEDIEVAL_WELL } from "./medievalWell";
import { createLowMedievalWellModel } from "./medievalWellLow";

it("keeps the site-scale well hollow, within its envelope and under the Low budget", () => {
  const model = createLowMedievalWellModel();
  try {
    model.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.group);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeLessThanOrEqual(MEDIEVAL_WELL.height);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeLessThanOrEqual(MEDIEVAL_WELL.width);
    expect(bounds.getSize(new THREE.Vector3()).z).toBeLessThanOrEqual(MEDIEVAL_WELL.depth);
    expect(collectModelMetrics(model.group).triangles).toBeLessThan(1000);
    expect(model.pickables.length).toBeLessThan(40);
    const ray = new THREE.Raycaster(new THREE.Vector3(-0.4, 1.2, 0), new THREE.Vector3(0, -1, 0));
    const curb = model.pickables.filter(mesh => ["well-curb", "well-coping"].includes(mesh.name));
    expect(ray.intersectObjects(curb)).toHaveLength(0);
    expect(ray.intersectObject(model.group.getObjectByName("shaft-water")!)).toHaveLength(1);
    ray.set(new THREE.Vector3(0.95, 1.2, 0), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObjects(curb).length).toBeGreaterThan(0);
    ray.set(new THREE.Vector3(0.16, 1.05, 0.17), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(model.group.getObjectByName("bucket-shell")!)).toHaveLength(0);
    expect(ray.intersectObject(model.group.getObjectByName("bucket-bottom")!).length).toBeGreaterThan(0);
  } finally {
    model.dispose();
  }
});

it("disposes each shared Low-well geometry and material once", () => {
  const model = createLowMedievalWellModel();
  const geometries = new Set(model.pickables.map(mesh => mesh.geometry));
  const materials = new Set(
    model.pickables.flatMap(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]))
  );
  const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});

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
