import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createSloop, SLOOP } from "./sloop";

it("provides a closed small hull and a single-masted fore-and-aft rig within its envelope", () => {
  const model = createSloop();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(SLOOP.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(SLOOP.beam);
  expect(bounds.max.y).toBeLessThanOrEqual(SLOOP.height);
  expect(bounds.min.y).toBeCloseTo(-SLOOP.draft);
  const hit = (origin: THREE.Vector3, direction: THREE.Vector3, name: string) => {
    const hits = new THREE.Raycaster(origin, direction).intersectObjects(model.pickables.filter(m => m.name === name));
    expect(hits.length).toBeGreaterThan(0);
    return hits[0].point;
  };
  expect(hit(new THREE.Vector3(0, 5, 1.2), new THREE.Vector3(0, -1, 0), "main-deck").y).toBeCloseTo(1.3);
  hit(new THREE.Vector3(0, -5, 0), new THREE.Vector3(0, 1, 0), "hull-underwater");
  for (const side of [-1, 1]) hit(new THREE.Vector3(0, 1, side * 5), new THREE.Vector3(0, 0, -side), "hull-topsides");
  hit(new THREE.Vector3(-10, 1, 0), new THREE.Vector3(1, 0, 0), "transom");
  hit(new THREE.Vector3(10, 1, 0), new THREE.Vector3(-1, 0, 0), "stem");
  for (const name of ["mast", "gaff-mainsail", "jib", "rudder-blade", "tiller"]) {
    expect(model.pickables.filter(mesh => mesh.name === name)).toHaveLength(1);
  }
  for (const mesh of model.pickables) {
    expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
  }
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).toContain("<path");
  model.dispose();
});

it("disposes shared hull, sail and rigging resources once when switching models", () => {
  const model = createSloop();
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
