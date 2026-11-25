import * as THREE from "three";
import { expect, it } from "vitest";
import { createPavise, PAVISE } from "./pavise";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const named = (model: { pickables: THREE.Mesh[] }, name: string) => model.pickables.filter(m => m.name === name);

it.each(["low", "high"] as const)("%s stands on its foot and prop", quality => {
  const model = createPavise(quality);
  model.group.updateMatrixWorld(true);
  expect(box(model.group).min.y).toBeCloseTo(0, 3);
  const prop = box(named(model, "prop")[0]);
  expect(prop.min.y).toBeCloseTo(0, 2);
  // The prop stands behind the shield.
  expect(prop.min.x).toBeLessThan(box(named(model, "face")[0]).min.x);
  for (const mesh of model.pickables) expect(box(mesh).isEmpty(), mesh.name).toBe(false);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("keeps the Met pavise's 107.95 × 52.07 cm face and 12.7 cm of curvature", () => {
  const model = createPavise("low");
  model.group.updateMatrixWorld(true);
  const face = named(model, "face")[0];
  // Measure the board upright, before its lean.
  face.geometry.computeBoundingBox();
  const size = face.geometry.boundingBox!.getSize(new THREE.Vector3());
  expect(size.y).toBeCloseTo(1.0795, 3);
  expect(size.z).toBeCloseTo(0.5207, 3);
  expect(size.x).toBeCloseTo(0.127, 3);
  model.dispose();
});

it("comes within a quarter of the recorded 7.57 kg as a limewood board of 2.5 cm", () => {
  // A full 2.5 cm of limewood across the section gives about 9.3 kg; the original's wings were probably thinner.
  const mass = PAVISE.boardVolume * PAVISE.boardDensity;
  expect(mass).toBeGreaterThan(PAVISE.recordedMass);
  expect(mass).toBeLessThan(PAVISE.recordedMass * 1.25);
});

it("adds the rim, badge, grip and fittings on the high tier", () => {
  const low = createPavise("low"),
    high = createPavise("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of ["rim", "crown", "ostrich-feather", "grip", "carrying-strap", "prop-staple", "prop-foot"])
    expect(names.has(name), name).toBe(true);
  expect(named(high, "ostrich-feather")).toHaveLength(3);
  expect(low.pickables.some(mesh => mesh.name === "crown")).toBe(false);
  low.dispose();
  high.dispose();
});

it("keeps the high tier's rim within the shield's width", () => {
  const model = createPavise("high");
  model.group.updateMatrixWorld(true);
  for (const mesh of model.pickables.filter(m => m.name === "rim")) {
    mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrix);
    expect(Math.max(Math.abs(local.min.z), Math.abs(local.max.z))).toBeLessThanOrEqual(PAVISE.width / 2 + 1e-6);
  }
  model.dispose();
});
