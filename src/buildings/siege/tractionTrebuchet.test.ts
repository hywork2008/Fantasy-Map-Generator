import * as THREE from "three";
import { expect, it } from "vitest";
import { createTractionTrebuchet, TRACTION_TREBUCHET } from "./tractionTrebuchet";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const named = (model: { pickables: THREE.Mesh[] }, name: string) => model.pickables.filter(m => m.name === name);

it.each(["low", "high"] as const)("%s stands on the ground and has no degenerate parts", quality => {
  const model = createTractionTrebuchet(quality);
  model.group.updateMatrixWorld(true);
  expect(box(model.group).min.y).toBeCloseTo(0, 2);
  for (const mesh of model.pickables) expect(box(mesh).isEmpty(), mesh.name).toBe(false);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("follows Tarver's reconstruction: a 16-ft beam divided six to one, 12-ft uprights, 16- and 12-ft sills", () => {
  const model = createTractionTrebuchet("low");
  model.group.updateMatrixWorld(true);
  const { beamLength, longArm, shortArm, uprightHeight, sills } = TRACTION_TREBUCHET;
  expect(beamLength).toBeCloseTo(4.877, 3);
  expect(longArm / shortArm).toBeCloseTo(6, 6);
  expect(longArm + shortArm).toBeCloseTo(beamLength, 6);
  for (const upright of named(model, "upright")) expect(box(upright).max.y).toBeCloseTo(uprightHeight, 3);
  expect(box(named(model, "long-sill")[0]).getSize(new THREE.Vector3()).x).toBeCloseTo(sills[0], 3);
  expect(box(named(model, "cross-sill")[0]).getSize(new THREE.Vector3()).z).toBeCloseTo(sills[1], 3);
  model.dispose();
});

it("rests with the long arm back toward the ground, clear of the base, and the ropes laid out in front", () => {
  const model = createTractionTrebuchet("high");
  model.group.updateMatrixWorld(true);
  const beam = box(named(model, "beam")[0]);
  expect(beam.min.x).toBeLessThan(-2);
  expect(beam.min.y).toBeGreaterThan(0.05);
  // Over the rear cross sill the beam's underside stays well above the sill.
  const { axleY, restAngle, crossSillX, beamButtThickness } = TRACTION_TREBUCHET;
  const centre = axleY - crossSillX * Math.tan(restAngle);
  const rearSill = named(model, "cross-sill")
    .map(box)
    .find(b => b.max.x < 0)!;
  expect(centre - beamButtThickness / 2 / Math.cos(restAngle)).toBeGreaterThan(rearSill.max.y + 0.3);
  const ropes = named(model, "pull-rope").map(box);
  expect(ropes).toHaveLength(2 * TRACTION_TREBUCHET.ropes);
  for (const rope of ropes) expect(rope.max.x).toBeGreaterThan(0);
  model.dispose();
});

it("adds windings, rings and fittings on the high tier", () => {
  const low = createTractionTrebuchet("low"),
    high = createTractionTrebuchet("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of ["rope-winding", "butt-band", "rope-ring", "axle-bushing", "sling-ring", "grip-knot"])
    expect(names.has(name), name).toBe(true);
  expect(low.pickables.some(mesh => mesh.name === "rope-winding")).toBe(false);
  low.dispose();
  high.dispose();
});
