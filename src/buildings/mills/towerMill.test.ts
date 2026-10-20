import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createTowerMill, TOWER_MILL } from "./towerMill";

it("tapers the stone tower, supports the cap, and clears the masonry throughout the sail sweep", () => {
  const model = createTowerMill();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(TOWER_MILL.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(TOWER_MILL.width);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(TOWER_MILL.depth);
  const blocks = model.pickables.filter(mesh => mesh.name === "masonry-block");
  const first = new THREE.Box3().setFromObject(blocks[0]);
  const last = new THREE.Box3().setFromObject(blocks.at(-1)!);
  expect(first.min.y).toBeCloseTo(0.015);
  expect(last.max.y).toBeCloseTo(TOWER_MILL.towerHeight - 0.015);
  const ray = (y: number) =>
    new THREE.Raycaster(new THREE.Vector3(0.2, y, 10), new THREE.Vector3(0, 0, -1)).intersectObjects(blocks)[0];
  expect(ray(1).point.z).toBeGreaterThan(ray(10).point.z);
  const rotor = model.group.getObjectByName("sail-assembly")!;
  const cap = model.group.getObjectByName("rotating-cap")!;
  expect(rotor.parent).toBe(cap);
  expect(model.group.getObjectByName("cap-roof")!.parent).toBe(cap);
  expect(blocks[0].parent).toBe(model.group);
  expect(rotor.children).toHaveLength(4);
  const drum = new THREE.Box3().setFromObject(model.group.getObjectByName("cap-drum")!);
  expect(drum.min.y).toBeLessThanOrEqual(TOWER_MILL.towerHeight + 0.02);
  expect(drum.max.y).toBeGreaterThan(TOWER_MILL.towerHeight);
  for (let angle = 0; angle < Math.PI / 2; angle += Math.PI / 12) {
    rotor.rotation.z = angle;
    model.group.updateMatrixWorld(true);
    const sails = new THREE.Box3().setFromObject(rotor);
    expect(sails.min.y).toBeGreaterThan(0);
    expect(sails.min.z).toBeGreaterThan(TOWER_MILL.baseRadius);
    expect(sails.max.y).toBeLessThan(TOWER_MILL.height);
  }
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.elevation).toContain("<path");
  model.dispose();
});

it("releases shared masonry and nested cap resources exactly once", () => {
  const model = createTowerMill();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  model.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    for (const material of [object.material].flat()) resources.add(material);
  });
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});
