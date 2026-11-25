import * as THREE from "three";
import { expect, it } from "vitest";
import { AMPHITHEATRE, createAmphitheatre } from "./amphitheatre";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const named = (model: { pickables: THREE.Mesh[] }, name: string) => model.pickables.filter(m => m.name === name);

it.each(["low", "high"] as const)(
  "%s keeps the outside on the ground and the arena sunk, with no degenerate parts",
  quality => {
    const model = createAmphitheatre(quality);
    model.group.updateMatrixWorld(true);
    for (const mesh of model.pickables) expect(box(mesh).isEmpty(), mesh.name).toBe(false);
    for (const name of ["outer-wall", "pier", "stairway", "site-ground"])
      for (const mesh of named(model, name)) expect(box(mesh).min.y, name).toBeCloseTo(0, 2);
    expect(box(model.group).min.y).toBeCloseTo(AMPHITHEATRE.arenaFloor, 1);
    expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
    model.dispose();
  }
);

it("matches Mau's overall and arena sizes", () => {
  const model = createAmphitheatre("low");
  model.group.updateMatrixWorld(true);
  const arena = box(named(model, "arena")[0]);
  expect(arena.max.x - arena.min.x).toBeCloseTo(35.1, 1);
  expect(arena.max.z - arena.min.z).toBeCloseTo(66.7, 1);
  const outer = new THREE.Box3();
  for (const pier of named(model, "pier")) outer.union(box(pier));
  // Pier faces give the overall size; the pier's corners stand a little proud of the curve.
  expect(outer.max.x - outer.min.x).toBeCloseTo(104, 0);
  expect(outer.max.z - outer.min.z).toBeCloseTo(135, 0);
  expect(named(model, "pier")).toHaveLength(AMPHITHEATRE.bays);
  model.dispose();
});

it("rises thirty-five rows from the arena wall to the terrace about 6 m above the ground", () => {
  const { profile, rows, terrace, arenaFloor, podium } = AMPHITHEATRE;
  const seats = profile.filter(step => step.kind === "seat");
  expect(seats).toHaveLength(rows.ima + rows.media + rows.summa);
  expect(profile.filter(step => step.kind === "walkway")).toHaveLength(2);
  expect(seats[0].y).toBeCloseTo(arenaFloor + podium, 6);
  for (let i = 1; i < profile.length; i++) expect(profile[i].y).toBeGreaterThanOrEqual(profile[i - 1].y);
  expect(terrace).toBeGreaterThan(5.5);
  expect(terrace).toBeLessThan(7);
});

it("cuts the corridors open through the lower seats and vaults them under the upper ones", () => {
  const { profile, cross, corridor, arenaFloor } = AMPHITHEATRE;
  expect(cross).toBeGreaterThan(0);
  const floorAt = (d: number) => arenaFloor * (1 - d / AMPHITHEATRE.rings.outer);
  // The seat over the vault mouth leaves headroom; the one before would not.
  expect(profile[cross - 1].y - floorAt(profile[cross].d0)).toBeGreaterThan(corridor.vault);
  expect(profile[cross - 2].y - floorAt(profile[cross - 1].d0)).toBeLessThan(corridor.vault + 0.4);
  const model = createAmphitheatre("low");
  model.group.updateMatrixWorld(true);
  // Nothing of the seating lies over the open cut.
  const seats = named(model, "seats")[0].geometry.getAttribute("position");
  const reach = profile[cross].d0;
  for (let i = 0; i < seats.count; i++) {
    const x = seats.getX(i),
      z = seats.getZ(i);
    const inCut = Math.abs(x) < AMPHITHEATRE.cut - 1e-3 && Math.abs(z) < AMPHITHEATRE.arena.length / 2 + reach - 0.5;
    expect(inCut, `${x}, ${z}`).toBe(false);
  }
  expect(named(model, "entrance-portal")).toHaveLength(2);
  expect(named(model, "death-gate")).toHaveLength(1);
  expect(named(model, "death-gate")[0].position.x).toBeLessThan(0);
  model.dispose();
});

it("seats about the recorded 20,000 at 0.4 m a spectator", () => {
  const capacity = AMPHITHEATRE.seatingLength / AMPHITHEATRE.seatPerPerson;
  expect(capacity / AMPHITHEATRE.recordedCapacity).toBeGreaterThan(0.8);
  expect(capacity / AMPHITHEATRE.recordedCapacity).toBeLessThan(1.25);
});

it("adds paintings, grating, box partitions, arches and the gate frame on the high tier", () => {
  const model = createAmphitheatre("high");
  const names = new Set(model.pickables.map(mesh => mesh.name));
  for (const name of [
    "fresco-scene",
    "fresco-pattern",
    "fresco-herm",
    "iron-grating",
    "gallery-box-wall",
    "blind-arch",
    "death-gate-frame"
  ])
    expect(names.has(name), name).toBe(true);
  model.dispose();
});
