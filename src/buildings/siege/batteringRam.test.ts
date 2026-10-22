import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { BATTERING_RAM, createBatteringRam, createBatteringRamModel } from "./batteringRam";

it("grounds four wheels and leaves the suspended ram clear of the chassis and roof", () => {
  const model = createBatteringRam();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(BATTERING_RAM.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(BATTERING_RAM.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(BATTERING_RAM.width);
  const parts = (name: string) => model.pickables.filter(mesh => mesh.name === name);
  expect(parts("wheel-iron-tire")).toHaveLength(4);
  for (const wheel of parts("wheel-iron-tire")) {
    expect(new THREE.Box3().setFromObject(wheel).min.y).toBeCloseTo(0);
  }
  const ram = new THREE.Box3().setFromObject(parts("ram-log")[0]);
  const head = new THREE.Box3().setFromObject(parts("striking-head")[0]);
  const fixedParts = model.pickables.filter(mesh =>
    /^(frame-post|longitudinal-brace|roof-tie|roof-deck|chassis-rail|axle-bolster)$/.test(mesh.name)
  );
  for (const part of fixedParts) {
    const fixed = new THREE.Box3().setFromObject(part);
    expect(fixed.intersectsBox(ram)).toBe(false);
    expect(fixed.intersectsBox(head)).toBe(false);
  }
  const roof = new THREE.Box3();
  for (const panel of parts("roof-deck")) roof.union(new THREE.Box3().setFromObject(panel));
  expect(head.min.x).toBeGreaterThan(roof.max.x);
  for (const collar of parts("suspension-collar")) {
    expect(ram.containsPoint(collar.position)).toBe(true);
    const tie = parts("roof-tie").find(mesh => mesh.position.x === collar.position.x)!;
    expect(tie).toBeDefined();
    expect(tie.position.y).toBeGreaterThan(ram.max.y);
  }
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).toContain("<path");
  expect(model.elevation).not.toBe(model.plan);
  model.dispose();
});

it("releases shared model resources once", () => {
  const model = createBatteringRamModel();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of model.pickables) {
    resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) resources.add(material);
  }
  const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
});
