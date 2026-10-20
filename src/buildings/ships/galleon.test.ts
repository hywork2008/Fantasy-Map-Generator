import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createGalleon, GALLEON } from "./galleon";

it("keeps the hull closed, the main deck exposed and the rig within the advertised envelope", () => {
  const model = createGalleon();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(GALLEON.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(21);
  expect(bounds.max.y).toBeLessThanOrEqual(GALLEON.height);
  expect(bounds.min.y).toBeCloseTo(-GALLEON.draft);
  const hit = (origin: THREE.Vector3, direction: THREE.Vector3, name: string) => {
    const meshes = model.pickables.filter(mesh => mesh.name === name);
    const hits = new THREE.Raycaster(origin, direction).intersectObjects(meshes);
    expect(hits.length).toBeGreaterThan(0);
    return hits[0].point;
  };
  expect(hit(new THREE.Vector3(0, 20, 3), new THREE.Vector3(0, -1, 0), "main-deck").y).toBeCloseTo(4.8);
  expect(hit(new THREE.Vector3(0, -10, 0), new THREE.Vector3(0, 1, 0), "hull-underwater").y).toBeCloseTo(
    -GALLEON.draft
  );
  hit(new THREE.Vector3(0, 3, -20), new THREE.Vector3(0, 0, 1), "hull-topsides");
  hit(new THREE.Vector3(-30, 2, 0), new THREE.Vector3(1, 0, 0), "transom");
  expect(model.pickables.filter(mesh => mesh.name === "square-sail")).toHaveLength(4);
  expect(model.pickables.filter(mesh => mesh.name === "lateen-sail")).toHaveLength(1);
  expect(model.pickables.filter(mesh => mesh.name === "cannon")).toHaveLength(14);
  for (const mesh of model.pickables) {
    expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
  }
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("releases each shared geometry and material exactly once, including rigging", () => {
  const model = createGalleon();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  model.group.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
    resources.add(object.geometry);
    for (const material of [object.material].flat()) resources.add(material);
  });
  const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const spy of disposals) expect(spy).toHaveBeenCalledTimes(1);
});
