import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createPostMill, POST_MILL } from "./postMill";

it("supports the elevated house and keeps the four sails clear of the roof and ground", () => {
  const model = createPostMill();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(POST_MILL.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(POST_MILL.width);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(POST_MILL.depth);
  const part = (name: string) => model.pickables.find(mesh => mesh.name === name)!;
  const post = new THREE.Box3().setFromObject(part("central-post"));
  const house = new THREE.Box3().setFromObject(part("mill-house"));
  expect(post.min.y).toBeLessThan(1);
  expect(post.max.y).toBeGreaterThan(house.min.y);
  expect(house.min.y).toBeGreaterThan(4);
  const sails = model.group.getObjectByName("sail-assembly")!;
  expect(sails.children).toHaveLength(4);
  const roofFront = Math.max(
    ...model.pickables
      .filter(mesh => ["roof-slope", "bargeboard", "ridge-cap"].includes(mesh.name))
      .map(mesh => new THREE.Box3().setFromObject(mesh).max.z)
  );
  const centers = sails.children.map(sail => new THREE.Box3().setFromObject(sail).getCenter(new THREE.Vector3()));
  expect(centers.filter(p => p.x < 0)).toHaveLength(2);
  expect(centers.filter(p => p.x > 0)).toHaveLength(2);
  for (let angle = 0; angle < Math.PI / 2; angle += Math.PI / 12) {
    sails.rotation.z = angle;
    model.group.updateMatrixWorld(true);
    const sweep = new THREE.Box3().setFromObject(sails);
    expect(sweep.min.y).toBeGreaterThan(0);
    expect(sweep.min.z).toBeGreaterThan(roofFront);
    expect(sweep.max.y).toBeLessThan(POST_MILL.height);
  }
  const entrance = new THREE.Box3().setFromObject(part("rear-landing"));
  expect(entrance.min.z).toBeLessThan(house.min.z);
  expect(entrance.max.y).toBeCloseTo(4.46);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.elevation).toContain("<path");
  model.dispose();
});

it("releases all shared and nested rotor resources once", () => {
  const model = createPostMill();
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
