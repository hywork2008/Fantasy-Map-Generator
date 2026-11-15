import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createFlintlockMusket, createFlintlockMusketModel, FLINTLOCK_MUSKET } from "./flintlockMusket";

function center(mesh: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
}

it("rests the toe on the ground, points the muzzle forward, and keeps the lock on the visible side", () => {
  const model = createFlintlockMusket();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0, 2);
  expect(bounds.max.y).toBeLessThanOrEqual(FLINTLOCK_MUSKET.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(FLINTLOCK_MUSKET.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(FLINTLOCK_MUSKET.width);
  expect(bounds.max.x - bounds.min.x).toBeGreaterThan(1.3);
  const parts = (name: string) => model.pickables.filter(mesh => mesh.name === name);
  const stock = parts("stock")[0];
  const barrel = parts("barrel")[0];
  const stockBox = new THREE.Box3().setFromObject(stock);
  const barrelBox = new THREE.Box3().setFromObject(barrel);
  expect(barrelBox.max.x).toBeGreaterThan(stockBox.max.x + 0.05);
  expect(center(parts("lock-plate")[0]).z).toBeGreaterThan(0.01);
  expect(center(parts("side-plate")[0]).z).toBeLessThan(-0.01);
  expect(center(parts("frizzen")[0]).x).toBeGreaterThan(center(parts("cock")[0]).x);
  expect(new THREE.Box3().setFromObject(parts("cock")[0]).max.y).toBeGreaterThan(
    new THREE.Box3().setFromObject(parts("lock-plate")[0]).max.y
  );
  expect(new THREE.Box3().setFromObject(parts("ramrod")[0]).max.x).toBeLessThan(barrelBox.max.x);
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).toContain("<path");
  expect(model.plan).not.toBe(model.elevation);
  const roles = (model.group.userData.modelParts as { role: string }[]).map(part => part.role);
  expect(roles).toEqual(["Stock", "Barrel", "Lock", "Furniture"]);
  model.dispose();
});

it("disposes each geometry and material once", () => {
  const model = createFlintlockMusketModel();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of model.pickables) {
    resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) resources.add(material);
  }
  const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
});
