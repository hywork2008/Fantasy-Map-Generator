import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createEarlyFieldCannon, createEarlyFieldCannonModel, EARLY_FIELD_CANNON } from "./earlyFieldCannon";

it("grounds the field carriage's two wheels and trail and keeps the muzzle clear", () => {
  const model = createEarlyFieldCannon();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(EARLY_FIELD_CANNON.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(EARLY_FIELD_CANNON.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(EARLY_FIELD_CANNON.width);
  const parts = (name: string) => model.pickables.filter(mesh => mesh.name === name);
  expect(parts("wheel-iron-tire")).toHaveLength(2);
  for (const mesh of [...parts("wheel-iron-tire"), ...parts("trail-shoe")]) {
    expect(new THREE.Box3().setFromObject(mesh).min.y).toBeCloseTo(0);
  }
  const barrel = parts("bronze-barrel")[0];
  const muzzle = barrel.localToWorld(new THREE.Vector3(0, 1.45, 0));
  const breech = barrel.localToWorld(new THREE.Vector3(0, -1.02, 0));
  expect(muzzle.y).toBeGreaterThan(breech.y);
  for (const cheek of parts("carriage-cheek")) {
    expect(muzzle.x).toBeGreaterThan(new THREE.Box3().setFromObject(cheek).max.x);
    expect(new THREE.Box3().setFromObject(cheek).containsPoint(muzzle)).toBe(false);
  }
  const boreEnd = parts("recessed-bore")[0].getWorldPosition(new THREE.Vector3());
  expect(muzzle.distanceTo(boreEnd)).toBeCloseTo(0.505);
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).toContain("<path");
  expect(model.plan).not.toBe(model.elevation);
  model.dispose();
});

it("disposes each shared geometry and material once", () => {
  const model = createEarlyFieldCannonModel();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of model.pickables) {
    resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) resources.add(material);
  }
  const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
});
