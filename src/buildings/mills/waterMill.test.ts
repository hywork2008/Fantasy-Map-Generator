import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createLowBankWaterMill, createWaterMill, LOW_BANK_WATER_MILLS, WATER_MILL } from "./waterMill";

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

it.each(LOW_BANK_WATER_MILLS)("keeps $id immersed below a low bank with intake upstream", spec => {
  const model = createLowBankWaterMill(spec, true);
  model.group.updateMatrixWorld(true);
  const bounds = (name: string) => new THREE.Box3().setFromObject(model.group.getObjectByName(name)!, true);
  const wheel = bounds("waterwheel-assembly");
  const surface = bounds("millrace-water").max.y;
  expect(surface).toBeCloseTo(-spec.bankDrop);
  expect(bounds("bank-section").max.y).toBeCloseTo(0);
  expect(spec.bankDrop).toBeGreaterThanOrEqual(0);
  expect(spec.bankDrop).toBeLessThanOrEqual(1);
  expect(wheel.min.y).toBeLessThan(surface - 0.25);
  expect(wheel.min.y).toBeGreaterThan(surface - 0.45);
  expect(wheel.max.y).toBeGreaterThan(0);
  expect(wheel.min.z).toBeGreaterThan(bounds("stone-ground-floor").max.z);
  const hub = model.group.getObjectByName("waterwheel-assembly")!.position;
  const intake = model.group.getObjectByName("low-sluice-gate")!.position;
  const tailrace = model.group.getObjectByName("tailrace-guide")!.position;
  expect((intake.x - hub.x) * spec.flow).toBeLessThan(-WATER_MILL.wheelRadius);
  expect((tailrace.x - hub.x) * spec.flow).toBeGreaterThan(WATER_MILL.wheelRadius);
  expect(bounds("low-sluice-gate").min.y).toBeGreaterThan(surface);
  expect(model.group.getObjectByName("flume-bed")).toBeUndefined();
  expect(model.group.getObjectByName("entrance-bridge-plank")).toBeUndefined();
  expect(bounds("entrance-door-board").max.z).toBeLessThan(0);
  expect(model.pickables.filter(mesh => mesh.name === "undershot-paddle")).toHaveLength(16);
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("omits the BV riverbank context from reusable low-bank models and releases their resources", () => {
  const model = createLowBankWaterMill(LOW_BANK_WATER_MILLS[0]);
  expect(model.group.getObjectByName("bank-section")).toBeUndefined();
  expect(model.group.getObjectByName("river-context")).toBeUndefined();
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
