import * as THREE from "three";
import { expect, it } from "vitest";
import { B2, createB2 } from "./b2Bomber";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);

it.each(["low", "high"] as const)(
  "%s matches the published envelope, stands on its tyres and faces the nose forward",
  quality => {
    const model = createB2(quality);
    model.group.updateMatrixWorld(true);
    const size = box(model.group).getSize(new THREE.Vector3());
    expect(box(model.group).min.y).toBeCloseTo(0, 3);
    expect(size.x).toBeCloseTo(B2.length, 2);
    expect(size.z).toBeCloseTo(B2.span, 2);
    expect(size.y).toBeCloseTo(B2.height, 2);
    const lowest = model.pickables.filter(mesh => box(mesh).min.y < 0.01);
    expect(lowest.length).toBe(10);
    for (const mesh of lowest) expect(mesh.name).toBe("tire");
    const foremost = model.pickables.reduce((a, b) => (box(a).max.x > box(b).max.x ? a : b));
    expect(foremost.name).toMatch(/^(wing|centre-body)$/);
    expect(model.pickables.filter(mesh => mesh.name === "engine-intake")).toHaveLength(2);
    expect(model.pickables.filter(mesh => mesh.name === "exhaust-trough")).toHaveLength(4);
    expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
    model.dispose();
  }
);

it("keeps the belly clear of the ground", () => {
  const model = createB2("high");
  model.group.updateMatrixWorld(true);
  for (const mesh of model.pickables.filter(m => m.name === "wing" || m.name === "centre-body"))
    expect(box(mesh).min.y).toBeGreaterThan(1.8);
  model.dispose();
});

it("adds control surfaces and fittings on the high tier", () => {
  const low = createB2("low"),
    high = createB2("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of [
    "elevon",
    "drag-rudder",
    "beaver-tail",
    "auxiliary-inlet-door",
    "main-gear-door",
    "bomb-bay-seam",
    "escape-hatch"
  ])
    expect(names.has(name), name).toBe(true);
  expect(high.pickables.filter(mesh => mesh.name === "elevon")).toHaveLength(6);
  expect(low.pickables.some(mesh => mesh.name === "elevon")).toBe(false);
  expect(high.pickables.length).toBeGreaterThan(low.pickables.length * 2);
  low.dispose();
  high.dispose();
});
