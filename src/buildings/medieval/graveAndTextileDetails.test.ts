import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as graves } from "./19-grave-markersModels";
import { models as workshops } from "./20-textile-leather-workshopsModels";

it.each([...graves, ...workshops])("$id High fits and owns independent renderable resources", definition => {
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
  expect(model.pickables.length).toBeLessThanOrEqual(10);
  for (const mesh of model.pickables)
    for (const attr of ["position", "normal"])
      expect(Array.from(mesh.geometry.getAttribute(attr).array).every(Number.isFinite)).toBe(true);
  for (const view of ["top", "side"] as const) {
    const svg = meshProjection(model, view);
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/NaN|Infinity/);
  }
  const resources = new Set(model.pickables.flatMap(m => [m.geometry, ...[m.material].flat()]));
  const spies = [...resources].map(r => vi.spyOn(r, "dispose")),
    otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(otherDispose).not.toHaveBeenCalled();
  other.dispose();
});

it.each(graves)("$id preserves its original CE default identity and geometry", definition => {
  expect(medievalDefinition(definition).variant).toBe(`medieval.${definition.id}@default#codex-gpt-6.1-sol`);
  const low = definition.variants![0].create(),
    original = definition.create();
  expect(low.group.name).toBe(original.group.name);
  expect(low.pickables.length).toBe(original.pickables.length);
  low.dispose();
  original.dispose();
});

it("ledger crosses are recessed into the stone instead of floating over it", () => {
  const model = graves[2].variants![1].create();
  model.group.updateMatrixWorld(true);
  const down = (x: number, z: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0)).intersectObjects(model.pickables)[0]
      .point.y;
  expect(down(0, -0.35)).toBeCloseTo(0.134, 5);
  expect(down(0.35, -0.35)).toBeCloseTo(0.185, 5);
  expect(down(0.15, -0.55)).toBeCloseTo(0.134, 5);
  model.dispose();
});

it.each(workshops)("$id keeps the frontage open and the roof correctly oriented", definition => {
  const model = definition.variants![1].create();
  model.group.updateMatrixWorld(true);
  const door = new THREE.Raycaster(new THREE.Vector3(0, 2.65, 2.3), new THREE.Vector3(0, 0, -1), 0, 2).intersectObjects(
    model.pickables
  );
  expect(door).toHaveLength(0);
  const roof = new THREE.Raycaster(new THREE.Vector3(1, 6, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(roof.point.y).toBeGreaterThan(3.15);
  expect(roof.face!.normal.y).toBeGreaterThan(0);
  model.dispose();
});
