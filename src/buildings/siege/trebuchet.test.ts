import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createTrebuchet, TREBUCHET } from "./trebuchet";

it("supports the axle while leaving clearance for the suspended ballast and the lowered sling", () => {
  const model = createTrebuchet();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(TREBUCHET.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(TREBUCHET.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(TREBUCHET.width);
  const part = (name: string) => model.pickables.find(mesh => mesh.name === name)!;
  const arm = part("throwing-arm");
  const armEnds = [-0.5, 0.5].map(y => new THREE.Vector3(0, y, 0).applyMatrix4(arm.matrixWorld));
  const pivot = new THREE.Vector3(0, TREBUCHET.pivotHeight, 0);
  expect(armEnds[0].distanceTo(pivot)).toBeCloseTo(TREBUCHET.shortArm);
  expect(armEnds[1].distanceTo(pivot)).toBeCloseTo(TREBUCHET.longArm);
  expect(armEnds[1].y).toBeLessThan(pivot.y);
  const hinge = part("counterweight-hinge");
  expect(hinge.position.distanceTo(armEnds[0])).toBeCloseTo(0);
  const chest = new THREE.Box3().setFromObject(part("ballast-floor"));
  expect(chest.getCenter(new THREE.Vector3()).x).toBeCloseTo(hinge.position.x);
  expect(chest.max.y).toBeLessThan(hinge.position.y);
  expect(chest.min.y).toBeGreaterThan(0.6);
  const ballastParts = model.pickables.filter(mesh => mesh.name.startsWith("ballast-"));
  const supports = model.pickables.filter(mesh =>
    ["frame-leg", "frame-tie", "longitudinal-brace", "outrigger-brace"].includes(mesh.name)
  );
  for (const ballast of ballastParts) {
    for (const support of supports) {
      expect(new THREE.Box3().setFromObject(ballast).intersectsBox(new THREE.Box3().setFromObject(support))).toBe(
        false
      );
    }
  }
  const projectile = part("projectile");
  const trough = new THREE.Box3().setFromObject(part("loading-trough"));
  expect(projectile.position.x).toBeGreaterThan(armEnds[1].x);
  expect(projectile.position.x).toBeLessThan(trough.max.x);
  expect(projectile.position.z).toBeCloseTo(0);
  expect(projectile.position.y).toBeGreaterThan(trough.max.y);
  const bearingHits = new THREE.Raycaster(
    new THREE.Vector3(0, TREBUCHET.pivotHeight, 5),
    new THREE.Vector3(0, 0, -1)
  ).intersectObjects(model.pickables.filter(mesh => mesh.name === "bearing-block"));
  expect(bearingHits.length).toBeGreaterThan(0);
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).not.toBe(model.plan);
  model.dispose();
});

it("disposes shared timber, rope and metal resources once when leaving the viewer", () => {
  const model = createTrebuchet();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of model.pickables) {
    resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) resources.add(material);
  }
  const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const spy of disposals) expect(spy).toHaveBeenCalledTimes(1);
});
