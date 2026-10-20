import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { CARRACK, createCarrack } from "./carrack";

it("provides a closed merchant hull, exposed waist and three-masted carrack rig within its envelope", () => {
  const model = createCarrack();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(CARRACK.length);
  expect(bounds.max.y).toBeLessThanOrEqual(CARRACK.height);
  expect(bounds.min.y).toBeCloseTo(-CARRACK.draft);
  const hit = (origin: THREE.Vector3, direction: THREE.Vector3, name: string) => {
    const meshes = model.pickables.filter(mesh => mesh.name === name);
    const hits = new THREE.Raycaster(origin, direction).intersectObjects(meshes);
    expect(hits.length).toBeGreaterThan(0);
    return hits[0].point;
  };
  expect(hit(new THREE.Vector3(0, 20, 3), new THREE.Vector3(0, -1, 0), "main-deck").y).toBeCloseTo(5.1);
  expect(hit(new THREE.Vector3(0, -10, 0), new THREE.Vector3(0, 1, 0), "hull-underwater").y).toBeCloseTo(
    -CARRACK.draft
  );
  for (const side of [-1, 1]) {
    hit(new THREE.Vector3(0, 3, side * 20), new THREE.Vector3(0, 0, -side), "hull-topsides");
  }
  hit(new THREE.Vector3(-30, 3, 0), new THREE.Vector3(1, 0, 0), "stern");
  hit(new THREE.Vector3(30, 3, 0), new THREE.Vector3(-1, 0, 0), "stem");
  expect(model.pickables.filter(mesh => mesh.name === "mast")).toHaveLength(3);
  expect(model.pickables.filter(mesh => mesh.name === "square-sail")).toHaveLength(3);
  expect(model.pickables.filter(mesh => mesh.name === "lateen-sail")).toHaveLength(1);
  expect(hit(new THREE.Vector3(13, 20, 2), new THREE.Vector3(0, -1, 0), "forecastle-deck").y).toBeGreaterThan(9);
  expect(hit(new THREE.Vector3(-14, 20, 2), new THREE.Vector3(0, -1, 0), "sterncastle-upper-deck").y).toBeGreaterThan(
    11
  );
  for (const mesh of model.pickables) {
    expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
  }
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("releases shared mesh and rigging resources once when switching models", () => {
  const model = createCarrack();
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
