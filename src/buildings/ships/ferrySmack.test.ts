import * as THREE from "three";
import { expect, it } from "vitest";
import { createFerrySmack, FERRY_SMACK, ferrySmackHalfBreadth } from "./ferrySmack";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const named = (model: { pickables: THREE.Mesh[] }, name: string) => model.pickables.filter(m => m.name === name);

it.each([
  ["low", "set"],
  ["low", "furled"],
  ["high", "set"],
  ["high", "furled"]
] as const)("%s with sails %s keeps the documented envelope", (quality, sails) => {
  const model = createFerrySmack(quality, { sails });
  model.group.updateMatrixWorld(true);
  const bounds = box(model.group);
  const size = bounds.getSize(new THREE.Vector3());
  expect(bounds.max.x).toBeCloseTo(FERRY_SMACK.hullLength / 2, 3);
  expect(size.x).toBeCloseTo(FERRY_SMACK.length, 2);
  expect(size.z).toBeCloseTo(FERRY_SMACK.width, 2);
  expect(bounds.min.y).toBeCloseTo(-FERRY_SMACK.draft, 3);
  expect(bounds.max.y).toBeCloseTo(FERRY_SMACK.height, 3);
  const hull = box(named(model, "hull-side")[0]).getSize(new THREE.Vector3());
  expect(hull.x).toBeCloseTo(FERRY_SMACK.hullLength, 3);
  expect(hull.z).toBeCloseTo(FERRY_SMACK.beam, 2);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("stands twelve horses in four files inside the hull at body height", () => {
  const { hold } = FERRY_SMACK;
  expect(FERRY_SMACK.horses).toBe(12);
  const outer = Math.max(...hold.files.map(Math.abs)) + hold.horseHalfWidth;
  for (let x = hold.aft; x <= hold.aft + 3 * hold.stall + 1e-6; x += 0.25)
    expect(ferrySmackHalfBreadth(x, 0.5), `x = ${x}`).toBeGreaterThan(outer);
  // The mast stands forward of the hold.
  const model = createFerrySmack("low");
  model.group.updateMatrixWorld(true);
  expect(box(named(model, "mast")[0]).min.x).toBeGreaterThan(hold.fore);
  model.dispose();
});

it("lowers the gaff onto the boom when the sails are furled", () => {
  const set = createFerrySmack("low", { sails: "set" }),
    furled = createFerrySmack("low", { sails: "furled" });
  for (const model of [set, furled]) model.group.updateMatrixWorld(true);
  expect(named(set, "mainsail")).toHaveLength(1);
  expect(named(furled, "mainsail")).toHaveLength(0);
  expect(named(furled, "furled-mainsail")).toHaveLength(1);
  const boomTop = box(named(furled, "boom")[0]).max.y;
  expect(box(named(furled, "gaff")[0]).max.y).toBeLessThan(boomTop + 0.6);
  expect(box(named(set, "gaff")[0]).max.y).toBeGreaterThan(10);
  set.dispose();
  furled.dispose();
});

it("keeps the half-raised leeboards above the bottom and outboard of the hull", () => {
  const model = createFerrySmack("low");
  model.group.updateMatrixWorld(true);
  const boards = named(model, "leeboard").map(box);
  expect(boards).toHaveLength(2);
  for (const board of boards) {
    expect(board.min.y).toBeGreaterThan(-FERRY_SMACK.draft);
    expect(Math.min(Math.abs(board.min.z), Math.abs(board.max.z))).toBeGreaterThan(FERRY_SMACK.beam / 2 - 0.02);
    // Trailing aft from the pivot.
    expect(board.min.x).toBeLessThan(0);
  }
  model.dispose();
});

it("adds rigging and fittings on the high tier", () => {
  const low = createFerrySmack("low"),
    high = createFerrySmack("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of ["shroud", "forestay", "mast-hoop", "chainplate", "thole", "breast-bar", "leeboard-pendant"])
    expect(names.has(name), name).toBe(true);
  expect(low.pickables.some(mesh => mesh.name === "shroud")).toBe(false);
  low.dispose();
  high.dispose();
});
