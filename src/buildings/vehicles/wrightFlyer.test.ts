import * as THREE from "three";
import { expect, it } from "vitest";
import { createWrightFlyer, WRIGHT_FLYER } from "./wrightFlyer";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);

it.each(["low", "high"] as const)("%s matches the published envelope and rests on its skids", quality => {
  const model = createWrightFlyer(quality);
  model.group.updateMatrixWorld(true);
  const bounds = box(model.group);
  const size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(0, 3);
  expect(size.x).toBeCloseTo(WRIGHT_FLYER.length, 2);
  expect(size.z).toBeCloseTo(WRIGHT_FLYER.span, 2);
  expect(size.y).toBeCloseTo(WRIGHT_FLYER.height, 2);
  const lowest = model.pickables.filter(mesh => box(mesh).min.y < 0.01);
  expect(lowest.length).toBeGreaterThan(0);
  for (const mesh of lowest) expect(mesh.name).toBe("skid");
  const foremost = model.pickables.reduce((a, b) => (box(a).max.x > box(b).max.x ? a : b));
  expect(foremost.name).toMatch(/^elevator/);
  const hindmost = model.pickables.reduce((a, b) => (box(a).min.x < box(b).min.x ? a : b));
  expect(hindmost.name).toBe("rudder");
  expect(model.pickables.filter(mesh => mesh.name === "propeller-blade")).toHaveLength(4);
  expect(model.pickables.filter(mesh => mesh.name === "rudder")).toHaveLength(2);
  // The wings keep the published gap at the centre.
  const [lower, upper] = ["lower-wing", "upper-wing"].map(name => box(model.pickables.find(m => m.name === name)!));
  expect(upper.max.y - lower.max.y).toBeCloseTo(WRIGHT_FLYER.gap, 2);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("keeps the propellers clear of each other, the ground and the rudder outriggers' plane", () => {
  const model = createWrightFlyer("high");
  model.group.updateMatrixWorld(true);
  const blades = model.pickables.filter(mesh => mesh.name === "propeller-blade").map(box);
  for (const blade of blades) expect(blade.min.y).toBeGreaterThan(0.1);
  const left = blades.filter(b => b.max.z < 0),
    right = blades.filter(b => b.min.z > 0);
  expect(left).toHaveLength(2);
  expect(right).toHaveLength(2);
  model.dispose();
});

it("adds rigging, ribs and the drive train on the high tier", () => {
  const low = createWrightFlyer("low"),
    high = createWrightFlyer("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of ["wing-rib", "bracing-wire", "blinker", "chain", "sprocket", "radiator", "hip-cradle"])
    expect(names.has(name), name).toBe(true);
  expect(low.pickables.some(mesh => mesh.name === "bracing-wire")).toBe(false);
  expect(high.pickables.length).toBeGreaterThan(low.pickables.length * 2);
  low.dispose();
  high.dispose();
});
