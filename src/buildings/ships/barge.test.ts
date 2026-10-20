import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { BARGE, createBarge } from "./barge";

it("provides a closed shallow flat-bottomed hull with rising ends and accessible side decks", () => {
  const model = createBarge();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(BARGE.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(BARGE.beam);
  expect(bounds.max.y).toBeLessThanOrEqual(BARGE.height);
  expect(bounds.min.y).toBeCloseTo(-BARGE.draft);
  const hit = (origin: THREE.Vector3, direction: THREE.Vector3, name: string) => {
    const hits = new THREE.Raycaster(origin, direction).intersectObjects(model.pickables.filter(m => m.name === name));
    expect(hits.length).toBeGreaterThan(0);
    return hits[0].point;
  };
  for (const x of [-4, 0, 4]) {
    expect(hit(new THREE.Vector3(x, -4, 0), new THREE.Vector3(0, 1, 0), "flat-bottom").y).toBeCloseTo(-BARGE.draft);
  }
  for (const x of [-9, 9]) {
    expect(hit(new THREE.Vector3(x, -4, 0), new THREE.Vector3(0, 1, 0), "flat-bottom").y).toBeGreaterThan(-0.3);
  }
  for (const side of [-1, 1]) {
    hit(new THREE.Vector3(0, 0.3, side * 5), new THREE.Vector3(0, 0, -side), "hull-sides");
    expect(hit(new THREE.Vector3(0, 5, side * 2.4), new THREE.Vector3(0, -1, 0), "cargo-deck").y).toBeCloseTo(0.9);
  }
  hit(new THREE.Vector3(-12, 0.5, 0), new THREE.Vector3(1, 0, 0), "stern");
  hit(new THREE.Vector3(12, 0.5, 0), new THREE.Vector3(-1, 0, 0), "bow");
  for (const name of ["cargo-crate", "cargo-barrel", "timber-cargo", "towing-post", "rudder-blade"]) {
    expect(model.pickables.some(mesh => mesh.name === name)).toBe(true);
  }
  for (const mesh of model.pickables) {
    expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
  }
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).toContain("<path");
  model.dispose();
});

it("releases shared cargo and hull resources exactly once when switching models", () => {
  const model = createBarge();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  model.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    for (const material of [object.material].flat()) resources.add(material);
  });
  const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const spy of disposals) expect(spy).toHaveBeenCalledTimes(1);
});
