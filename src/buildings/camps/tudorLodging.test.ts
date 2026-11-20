import * as THREE from "three";
import { expect, it } from "vitest";
import { createTudorLodging, TUDOR_LODGING } from "./tudorLodging";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const named = (model: { pickables: THREE.Mesh[] }, name: string) =>
  model.pickables.filter(m => m.name === name).map(box);
const YARD = 0.9144;

it.each(["low", "high"] as const)("%s stands on the ground with no degenerate parts", quality => {
  const model = createTudorLodging(quality);
  model.group.updateMatrixWorld(true);
  expect(box(model.group).min.y).toBeCloseTo(0, 3);
  for (const mesh of model.pickables) expect(box(mesh).isEmpty(), mesh.name).toBe(false);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("sizes the round house from 25 wall breadths and a roof 6¾ yards deep", () => {
  const { round, breadth } = TUDOR_LODGING;
  expect(2 * Math.PI * round.radius).toBeCloseTo(25 * breadth, 6);
  expect(Math.hypot(round.radius, round.rise)).toBeCloseTo(6.75 * YARD, 6);
  expect(round.gores).toBe(2 * round.breadths);
  const model = createTudorLodging("low");
  model.group.updateMatrixWorld(true);
  const wall = named(model, "round-house-wall")[0];
  expect(wall.max.x - wall.min.x).toBeCloseTo(2 * round.radius, 1);
  expect(wall.max.y).toBeCloseTo(2.5 * YARD, 3);
  expect(named(model, "round-house-roof")[0].max.y).toBeCloseTo(round.peak, 3);
  model.dispose();
});

it("sizes the hall from 8 roof breadths and 32 wall breadths round straight sides and half-round ends", () => {
  const { hall, breadth } = TUDOR_LODGING;
  expect(2 * hall.straight + 2 * Math.PI * hall.radius).toBeCloseTo(32 * breadth, 6);
  expect(Math.hypot(hall.radius, hall.rise)).toBeCloseTo(4 * YARD, 6);
  const model = createTudorLodging("low");
  model.group.updateMatrixWorld(true);
  const xs = named(model, "hall-end-wall");
  expect(Math.max(...xs.map(b => b.max.x)) - Math.min(...xs.map(b => b.min.x))).toBeCloseTo(
    hall.straight + 2 * hall.radius,
    1
  );
  model.dispose();
});

it("joins the hall to the round house with the passage", () => {
  const { hall, round, roundZ, passage } = TUDOR_LODGING;
  expect(roundZ - round.radius - hall.radius).toBeCloseTo(passage.length, 6);
  const model = createTudorLodging("low");
  model.group.updateMatrixWorld(true);
  for (const wall of named(model, "passage-wall")) {
    expect(wall.min.z).toBeLessThan(hall.radius);
    expect(wall.max.z).toBeGreaterThan(roundZ - round.radius);
  }
  model.dispose();
});

it("adds seams, buckram, the say rose and guys on the high tier", () => {
  const low = createTudorLodging("low"),
    high = createTudorLodging("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of ["gore-seam", "breadth-seam", "buckram-branch", "say-rose", "door-flap", "guy-rope", "tent-peg"])
    expect(names.has(name), name).toBe(true);
  expect(low.pickables.some(mesh => mesh.name === "gore-seam")).toBe(false);
  low.dispose();
  high.dispose();
});
