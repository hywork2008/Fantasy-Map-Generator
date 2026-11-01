import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as kilns } from "./30-lime-kilnsModels";
import { models as fields } from "./31-bleaching-fieldsModels";
import { createBleachingFieldPart } from "./bleachingFieldDetails";
import { createLimeKilnPart } from "./limeKilnDetails";

it.each([...kilns, ...fields])("$id High fits, projects, owns resources and keeps the CE default", definition => {
  const model = definition.variants![1].create(),
    other = definition.variants![1].create();
  const bounds = new THREE.Box3().setFromObject(model.group, true),
    size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(0, 5);
  for (const [actual, limit] of [
    [size.x, definition.size[0]],
    [size.z, definition.size[1]],
    [size.y, definition.size[2]]
  ])
    expect(actual).toBeLessThanOrEqual(limit + 0.00001);
  expect(model.pickables.length).toBeLessThanOrEqual(8);
  for (const mesh of model.pickables)
    for (const attr of ["position", "normal"])
      expect(Array.from(mesh.geometry.getAttribute(attr).array).every(Number.isFinite)).toBe(true);
  for (const view of ["top", "side"] as const) {
    const svg = meshProjection(model, view);
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/NaN|Infinity/);
  }
  const resources = new Set(model.pickables.flatMap(m => [m.geometry, ...[m.material].flat()])),
    spies = [...resources].map(r => vi.spyOn(r, "dispose")),
    otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(otherDispose).not.toHaveBeenCalled();
  other.dispose();
  expect(medievalDefinition(definition).variant).toBe(`medieval.${definition.id}@default#codex-gpt-6.1-sol`);
  const low = definition.variants![0].create(),
    original = definition.create();
  expect(low.group.name).toBe(original.group.name);
  expect(low.pickables.length).toBe(original.pickables.length);
  low.dispose();
  original.dispose();
});

it.each([...kilns, ...fields])("$id exposes three independent, correctly labelled High components", definition => {
  const factories = definition.parts!(definition.variants![1].id),
    full = definition.variants![1].create();
  expect(factories).toHaveLength(3);
  expect(full.group.userData.modelParts.map((p: { id: string }) => p.id)).toEqual(factories.map(p => p.id));
  for (const factory of factories) {
    const part = definition.assembleParts!([factory]);
    expect(part.group.userData.modelParts).toHaveLength(1);
    expect(part.group.userData.modelParts[0].quality).toBe("high");
    expect(
      part.pickables.every(m => m.userData.modelPartRanges.every((r: { partId: string }) => r.partId === factory.id))
    ).toBe(true);
    part.dispose();
  }
  full.dispose();
});

it("kiln stoking passage actually enters the hearth and the charging mouth stays open", () => {
  const model = kilns[0].variants![1].create();
  model.group.updateMatrixWorld(true);
  for (const y of [0.65, 1.1, 1.35]) {
    const opening = new THREE.Raycaster(
      new THREE.Vector3(0, y, 2.9),
      new THREE.Vector3(0, 0, -1),
      0,
      3.2
    ).intersectObjects(model.pickables);
    expect(opening).toHaveLength(0);
  }
  const wall = new THREE.Raycaster(
    new THREE.Vector3(0.8, 1.1, 2.9),
    new THREE.Vector3(0, 0, -1),
    0,
    1
  ).intersectObjects(model.pickables);
  expect(wall.length).toBeGreaterThan(0);
  const mouth = new THREE.Raycaster(new THREE.Vector3(0, 6, -0.5), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(mouth.point.y).toBeLessThan(3.3);
  expect(mouth.point.y).toBeGreaterThan(2.75);
  model.dispose();
});

it("charging landing meets its piers and reaches the coping without a rail across the approach", () => {
  const bank = createLimeKilnPart("charging-bank");
  bank.group.updateMatrixWorld(true);
  for (const x of [-1.02, 1.02]) {
    const up = new THREE.Raycaster(
      new THREE.Vector3(x, 4.04, -2.35),
      new THREE.Vector3(0, 1, 0),
      0,
      0.1
    ).intersectObjects(
      bank.pickables.filter(p => ["charging-crest-landing", "crest-landing-pier"].includes(p.name))
    )[0];
    expect(up.point.y).toBeCloseTo(4.07, 5);
  }
  const route = new THREE.Raycaster(new THREE.Vector3(0, 4.7, -2.8), new THREE.Vector3(0, 0, 1), 0, 1).intersectObjects(
    bank.pickables
  );
  expect(route).toHaveLength(0);
  const lastStep = new THREE.Raycaster(new THREE.Vector3(0, 5.5, -2.4), new THREE.Vector3(0, -1, 0)).intersectObjects(
    bank.pickables
  )[0];
  expect(lastStep.point.y).toBeCloseTo(4.25, 5);
  for (const post of bank.pickables.filter(p => p.name === "bank-handrail-post")) {
    const box = new THREE.Box3().setFromObject(post, true);
    const footing = bank.pickables.find(
      p => p.name === "bank-post-footing" && p.position.x === post.position.x && p.position.z === post.position.z
    )!;
    expect(footing).toBeDefined();
    expect(new THREE.Box3().setFromObject(footing, true).max.y).toBeCloseTo(box.min.y, 5);
  }
  bank.dispose();
});

it("bleaching linen rests on the grass and its gate opens onto a clear service path", () => {
  const ground = createBleachingFieldPart("ground-and-linen");
  ground.group.updateMatrixWorld(true);
  const sheets = ground.pickables.filter(m => m.name === "linen-spread-on-grass");
  expect(sheets).toHaveLength(6);
  for (const sheet of sheets) {
    const box = new THREE.Box3().setFromObject(sheet, true);
    expect(box.min.y).toBeCloseTo(0.05, 6);
    expect(box.max.y).toBeLessThan(0.06);
  }
  ground.dispose();
  const model = fields[0].variants![1].create();
  model.group.updateMatrixWorld(true);
  const passage = new THREE.Raycaster(
    new THREE.Vector3(9.6, 0.75, 6.2),
    new THREE.Vector3(-1, 0, 0),
    0,
    15
  ).intersectObjects(model.pickables);
  expect(passage).toHaveLength(0);
  model.dispose();
});

it("drying cloth is folded over supported rails rather than suspended below them", () => {
  const racks = createBleachingFieldPart("drying-racks");
  racks.group.updateMatrixWorld(true);
  const cloth = racks.pickables.filter(m => m.name === "linen-draped-over-crossbar"),
    rails = racks.pickables.filter(m => m.name === "drying-crossbar");
  for (const z of [-3, 0, 3]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(7.05, 3, z), new THREE.Vector3(0, -1, 0));
    const clothTop = ray.intersectObjects(cloth)[0].point.y,
      railTop = ray.intersectObjects(rails)[0].point.y;
    expect(clothTop - railTop).toBeGreaterThanOrEqual(0);
    expect(clothTop - railTop).toBeLessThan(0.006);
  }
  racks.dispose();
});

it("washing tub surfaces remain below the open rims", () => {
  const model = fields[0].variants![1].create();
  model.group.updateMatrixWorld(true);
  for (const z of [-5.4, 4.25]) {
    const water = new THREE.Raycaster(
      new THREE.Vector3(7.05, 1.2, z - 0.2),
      new THREE.Vector3(0, -1, 0)
    ).intersectObjects(model.pickables)[0];
    expect(water.point.y).toBeCloseTo(0.62, 5);
  }
  model.dispose();
});
