import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adopt, adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as breweries } from "./15-breweriesModels";
import { models as granaries } from "./16-granariesModels";
import { MEDIEVAL_VARIANTS } from "./medievalVariants";

it.each([...breweries, ...granaries])("$id High fits, projects and owns independent resources", definition => {
  const variant = definition.variants!.find(v => v.level === "high")!;
  expect(adoptedVariant(variant.family, "high").id).toBe(variant.id);
  const model = variant.create(),
    other = variant.create(),
    bounds = new THREE.Box3().setFromObject(model.group, true),
    size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(0, 5);
  for (const [actual, limit] of [
    [size.x, definition.size[0]],
    [size.z, definition.size[1]],
    [size.y, definition.size[2]]
  ])
    expect(actual).toBeLessThanOrEqual(limit + 0.00001);
  expect(model.pickables.length).toBeLessThanOrEqual(definition.task === 15 ? 15 : 14);
  for (const mesh of model.pickables)
    for (const attribute of ["position", "normal"])
      expect(Array.from(mesh.geometry.getAttribute(attribute).array).every(Number.isFinite)).toBe(true);
  for (const view of ["top", "side"] as const) {
    const drawing = meshProjection(model, view);
    expect(drawing).toContain("<path");
    expect(drawing).not.toMatch(/NaN|Infinity/);
  }
  const resources = new Set(model.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose")),
    otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(otherDispose).not.toHaveBeenCalled();
  other.dispose();
});

it.each(breweries)("$id separates its roofs and retains open furnace, vessels and chimney", definition => {
  const large = definition.id === "town-brewery",
    width = large ? 8 : 5.5,
    cx = -2 + width / 2 + 3.35;
  const model = definition.variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  const top = (x: number, z: number, y = 10) =>
    new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0)).intersectObjects(model.pickables);
  expect(top(-2 + width / 2 + 0.675, -1)).toHaveLength(0);
  expect(top(-2, 0)[0].point.y).toBeGreaterThan(3);
  expect(top(cx, 0)[0].point.y).toBeGreaterThan(3);
  const mouth = (dx: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(cx - 0.5 + dx, 0.5, 1.2),
      new THREE.Vector3(0, 0, -1),
      0,
      0.6
    ).intersectObjects(model.pickables);
  expect(mouth(0)).toHaveLength(0);
  expect(mouth(0.6).length).toBeGreaterThan(0);
  expect(top(cx - 0.5, 0, 2.1)[0].point.y).toBeCloseTo(1.6, 4);
  expect(top(cx + 1.2, 1.1, 2)[0].point.y).toBeCloseTo(0.946, 4);
  const flue = new THREE.Raycaster(
    new THREE.Vector3(cx - 1.1, 5.3, -1.65),
    new THREE.Vector3(0, -1, 0),
    0,
    3.1
  ).intersectObjects(model.pickables);
  expect(flue).toHaveLength(0);
  model.dispose();
});

it("the raised granary has genuine underfloor clearance, a doorway and ventilating gaps", () => {
  const model = granaries[0].variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  const beneath = (x: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 0.5, 3), new THREE.Vector3(0, 0, -1), 0, 6).intersectObjects(
      model.pickables
    );
  expect(beneath(0.9)).toHaveLength(0);
  expect(beneath(0).length).toBeGreaterThan(0);
  const door = new THREE.Raycaster(new THREE.Vector3(0, 2, 2.7), new THREE.Vector3(0, 0, -1), 0, 0.8).intersectObjects(
    model.pickables
  );
  expect(door).toHaveLength(0);
  const vent = (x: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 2.79, 2.65), new THREE.Vector3(0, 0, -1), 0, 0.65).intersectObjects(
      model.pickables
    );
  expect(vent(1.65)).toHaveLength(0);
  expect(vent(1.15).length).toBeGreaterThan(0);
  model.dispose();
});

it("the stone store leaves both loading doorways clear of doors and hoist framing", () => {
  const model = granaries[1].variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  for (const y of [1.4, 3.65]) {
    const open = new THREE.Raycaster(
      new THREE.Vector3(0, y, 2.4),
      new THREE.Vector3(0, 0, -1),
      0,
      0.8
    ).intersectObjects(model.pickables);
    expect(open).toHaveLength(0);
  }
  const wall = new THREE.Raycaster(
    new THREE.Vector3(1.5, 1.4, 2.4),
    new THREE.Vector3(0, 0, -1),
    0,
    0.8
  ).intersectObjects(model.pickables);
  expect(wall.length).toBeGreaterThan(0);
  model.dispose();
});

it.each(granaries)("$id preserves its existing CE default variant and original factory", definition => {
  const variant = adopt(MEDIEVAL_VARIANTS, `medieval.${definition.id}`, "default");
  expect(variant.id).toBe(`medieval.${definition.id}@default#codex-gpt-6.1-sol`);
  expect(medievalDefinition(definition).variant).toBe(variant.id);
  const model = variant.create();
  expect(model.group.name).toBe(definition.id);
  model.dispose();
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
});
