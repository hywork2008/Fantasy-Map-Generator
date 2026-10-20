import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createWaterMill, WATER_MILL } from "./waterMill";

it("keeps the overshot wheel clear of the house, race, flume and entrance bridge", () => {
  const model = createWaterMill();
  const bounds = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object, true);
  const part = (name: string) => model.pickables.find(mesh => mesh.name === name)!;
  model.group.updateMatrixWorld(true);
  const envelope = bounds(model.group);
  expect(envelope.min.y).toBeGreaterThanOrEqual(0);
  expect(envelope.max.y).toBeLessThanOrEqual(WATER_MILL.height);
  expect(envelope.max.x - envelope.min.x).toBeLessThanOrEqual(WATER_MILL.width);
  expect(envelope.max.z - envelope.min.z).toBeLessThanOrEqual(WATER_MILL.depth);
  const wheel = model.group.getObjectByName("waterwheel-assembly")!;
  expect(wheel.children.filter(child => child.name === "wheel-bucket")).toHaveLength(24);
  for (let i = 0; i < 8; i++) {
    wheel.rotation.z = (i * Math.PI) / 16;
    model.group.updateMatrixWorld(true);
    const sweep = bounds(wheel);
    expect(sweep.min.y).toBeGreaterThan(bounds(part("millrace-water")).max.y);
    expect(sweep.min.z).toBeGreaterThan(bounds(part("stone-ground-floor")).max.z);
    expect(sweep.max.y).toBeLessThan(bounds(part("flume-bed")).min.y);
    expect(sweep.min.x).toBeGreaterThan(bounds(part("entrance-bridge-plank")).max.x);
    expect(sweep.max.z).toBeLessThan(bounds(part("outer-bearing-pier")).min.z);
  }
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).toContain("<path");
  model.dispose();
});

it("disposes all wheel, building and water resources exactly once", () => {
  const model = createWaterMill();
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
