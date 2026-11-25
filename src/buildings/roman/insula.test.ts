import * as THREE from "three";
import { expect, it } from "vitest";
import { createInsula, INSULA } from "./insula";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const named = (model: { pickables: THREE.Mesh[] }, name: string) => model.pickables.filter(m => m.name === name);

it.each(["low", "high"] as const)("%s stands on the ground with no degenerate parts", quality => {
  const model = createInsula(quality);
  model.group.updateMatrixWorld(true);
  expect(box(model.group).min.y).toBeCloseTo(0, 3);
  expect(box(model.group).max.y).toBeCloseTo(INSULA.ridge, 2);
  for (const mesh of model.pickables) expect(box(mesh).isEmpty(), mesh.name).toBe(false);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("keeps the 40 × 22 m block of the Caseggiato di Diana under Trajan's 60-foot limit", () => {
  const model = createInsula("low");
  model.group.updateMatrixWorld(true);
  const wings = named(model, "wing").map(box);
  const all = wings.reduce((a, b) => a.union(b), new THREE.Box3());
  expect(all.max.x - all.min.x).toBeCloseTo(40, 3);
  expect(all.max.z - all.min.z).toBeCloseTo(22, 3);
  expect(INSULA.heightLimit).toBeCloseTo(17.75, 1);
  expect(INSULA.eaves).toBeLessThan(INSULA.heightLimit);
  expect(INSULA.floors).toHaveLength(4);
  model.dispose();
});

it("leaves the courtyard open, reached by passages from the north and south fronts only", () => {
  const model = createInsula("low");
  model.group.updateMatrixWorld(true);
  const centre = new THREE.Vector3(0, 1, 0);
  for (const wing of named(model, "wing")) expect(box(wing).containsPoint(centre)).toBe(false);
  const passages = named(model, "courtyard-passage").map(box);
  expect(passages).toHaveLength(2);
  for (const p of passages) expect(Math.abs((p.min.x + p.max.x) / 2)).toBeGreaterThan(INSULA.length / 2 - 0.1);
  expect(named(model, "shop-opening")).toHaveLength(INSULA.shops);
  model.dispose();
});

it("hangs the balcony along the first floor of the long street front", () => {
  const model = createInsula("low");
  model.group.updateMatrixWorld(true);
  const balconies = named(model, "balcony").map(box);
  expect(balconies).toHaveLength(1);
  expect(balconies[0].max.z).toBeLessThanOrEqual(-INSULA.depth / 2 + 1e-6);
  expect((balconies[0].min.y + balconies[0].max.y) / 2).toBeCloseTo(INSULA.floors[0], 3);
  model.dispose();
});

it("adds facing, fittings and the courtyard fountain on the high tier", () => {
  const low = createInsula("low"),
    high = createInsula("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of [
    "bonding-course",
    "window-arch",
    "balcony-corbel",
    "balcony-rail",
    "reservoir",
    "fountain-basin",
    "imbrex",
    "shutter"
  ])
    expect(names.has(name), name).toBe(true);
  expect(low.pickables.some(mesh => mesh.name === "bonding-course")).toBe(false);
  low.dispose();
  high.dispose();
});

it("winds every roof face upward so that the roof plan shows it", () => {
  const model = createInsula("low");
  for (const roof of named(model, "roof")) {
    roof.geometry.computeVertexNormals();
    const normals = roof.geometry.getAttribute("normal");
    for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeGreaterThan(0);
  }
  model.dispose();
});
