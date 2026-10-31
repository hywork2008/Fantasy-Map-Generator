import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adopt, adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as fuel } from "./13-fuel-storageModels";
import { models as churches } from "./14-parish-churchesModels";
import { MEDIEVAL_VARIANTS } from "./medievalVariants";

const definitions = [...fuel, ...churches];
it.each(definitions)("$id High fits, projects and owns independent resources", definition => {
  const variant = definition.variants!.find(v => v.level === "high")!;
  expect(adoptedVariant(variant.family, "high").id).toBe(variant.id);
  const model = variant.create(),
    other = variant.create();
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
    for (const attribute of ["position", "normal"])
      expect(Array.from(mesh.geometry.getAttribute(attribute).array).every(Number.isFinite)).toBe(true);
  for (const view of ["top", "side"] as const) {
    const projection = meshProjection(model, view);
    expect(projection).toContain("<path");
    expect(projection).not.toMatch(/NaN|Infinity/);
  }
  const resources = new Set(model.pickables.flatMap(m => [m.geometry, ...[m.material].flat()]));
  const spies = [...resources].map(r => vi.spyOn(r, "dispose")),
    otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(otherDispose).not.toHaveBeenCalled();
  other.dispose();
});

it.each(definitions)("$id keeps its original default CE variant and factory", definition => {
  const old = adopt(MEDIEVAL_VARIANTS, `medieval.${definition.id}`, "default");
  expect(old.id).toBe(`medieval.${definition.id}@default#codex-gpt-6.1-sol`);
  expect(medievalDefinition(definition).variant).toBe(old.id);
  const model = old.create();
  expect(model.group.name).toBe(definition.id);
  model.dispose();
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
});

it.each([
  { id: "covered-firewood-stack", y: 2.1, wallX: 1.95 },
  { id: "charcoal-bin", y: 1.25, wallX: 1.7 }
])("$id retains drying or loading clearance under an upward-facing roof", ({ id, y, wallX }) => {
  const model = fuel
    .find(m => m.id === id)!
    .variants!.find(v => v.level === "high")!
    .create();
  model.group.updateMatrixWorld(true);
  const ray = (x: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(x, y, 1.8),
      new THREE.Vector3(0, 0, -1),
      0,
      id === "charcoal-bin" ? 1.4 : 3.5
    ).intersectObjects(model.pickables);
  expect(ray(0)).toHaveLength(0);
  expect(ray(wallX).length).toBeGreaterThan(0);
  const top = new THREE.Raycaster(new THREE.Vector3(0.4, 5, 0.7), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(top.face!.normal.y).toBeGreaterThan(0);
  model.dispose();
});

it.each(churches)("$id has an open west entrance and belfry without losing its roof surfaces", definition => {
  const large = definition.id === "parish-church";
  const model = definition.variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  const entry = (z: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(large ? -8.5 : -4.8, 1.4, z),
      new THREE.Vector3(1, 0, 0),
      0,
      large ? 4.8 : 2
    ).intersectObjects(model.pickables);
  expect(entry(0)).toHaveLength(0);
  expect(entry(1).length).toBeGreaterThan(0);
  const belfry = (x: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(x, large ? 6.5 : 5.65, 2),
      new THREE.Vector3(0, 0, -1),
      0,
      4
    ).intersectObjects(model.pickables);
  expect(belfry(large ? -5.35 : -2.6)).toHaveLength(0);
  expect(belfry(large ? -6 : -2.45).length).toBeGreaterThan(0);
  const roof = new THREE.Raycaster(new THREE.Vector3(1, 12, 1.8), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(roof.face!.normal.y).toBeGreaterThan(0);
  model.dispose();
});
