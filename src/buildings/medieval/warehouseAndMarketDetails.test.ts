import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adopt, adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as warehouses } from "./17-warehousesModels";
import { models as markets } from "./18-livestock-marketsModels";
import { MEDIEVAL_VARIANTS } from "./medievalVariants";

it.each([...warehouses, ...markets])("$id High fits, projects and owns independent resources", definition => {
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
  expect(model.pickables.length).toBeLessThanOrEqual(8);
  for (const mesh of model.pickables)
    for (const attribute of ["position", "normal"])
      expect(Array.from(mesh.geometry.getAttribute(attribute).array).every(Number.isFinite)).toBe(true);
  for (const view of ["top", "side"] as const) {
    const drawing = meshProjection(model, view);
    expect(drawing).toContain("<path");
    expect(drawing).not.toMatch(/NaN|Infinity/);
  }
  const resources = new Set(model.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()])),
    spies = [...resources].map(r => vi.spyOn(r, "dispose")),
    otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(otherDispose).not.toHaveBeenCalled();
  other.dispose();
});

it.each([...warehouses, ...markets])("$id preserves its original CE default factory and identity", definition => {
  const old = adopt(MEDIEVAL_VARIANTS, `medieval.${definition.id}`, "default");
  expect(old.id).toBe(`medieval.${definition.id}@default#codex-gpt-6.1-sol`);
  expect(medievalDefinition(definition).variant).toBe(old.id);
  const model = old.create();
  expect(model.group.name).toBe(definition.id);
  model.dispose();
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
});

it.each(warehouses)("$id keeps freight openings and the central receiving route clear", definition => {
  const large = definition.id === "merchant-warehouse",
    front = large ? 2.5 : 2;
  const model = definition.variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  for (const y of large ? [1.7, 4.1, 6.6] : [1.7]) {
    const hole = new THREE.Raycaster(
      new THREE.Vector3(0, y, front + 0.4),
      new THREE.Vector3(0, 0, -1),
      0,
      1
    ).intersectObjects(model.pickables);
    expect(hole).toHaveLength(0);
  }
  const wall = new THREE.Raycaster(
    new THREE.Vector3(2, 1.7, front + 0.4),
    new THREE.Vector3(0, 0, -1),
    0,
    1
  ).intersectObjects(model.pickables);
  expect(wall.length).toBeGreaterThan(0);
  const route = new THREE.Raycaster(
    new THREE.Vector3(0, 1.7, front + 4.2),
    new THREE.Vector3(0, 0, -1),
    0,
    5
  ).intersectObjects(model.pickables);
  expect(route).toHaveLength(0);
  const roof = new THREE.Raycaster(new THREE.Vector3(1.3, 12, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(roof.face!.normal.y).toBeGreaterThan(0);
  model.dispose();
});

it("market buyers retain a continuous uncovered passage and recessed water troughs", () => {
  const model = markets[0].variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  const route = new THREE.Raycaster(
    new THREE.Vector3(0, 1.1, 4.6),
    new THREE.Vector3(0, 0, -1),
    0,
    9.2
  ).intersectObjects(model.pickables);
  expect(route).toHaveLength(0);
  const sky = new THREE.Raycaster(new THREE.Vector3(0, 5, -2.5), new THREE.Vector3(0, -1, 0), 0, 4.7).intersectObjects(
    model.pickables
  );
  expect(sky).toHaveLength(0);
  for (const side of [-1, 1]) {
    const water = new THREE.Raycaster(
      new THREE.Vector3(side * 3.3, 1.1, -2.7),
      new THREE.Vector3(0, -1, 0)
    ).intersectObjects(model.pickables)[0];
    expect(water.point.y).toBeCloseTo(0.48, 4);
  }
  model.dispose();
});

it.each([
  { side: -1, z: -2 },
  { side: -1, z: 2 },
  { side: 1, z: -2 },
  { side: 1, z: 2 }
])("pen $side/$z has an open gate onto the buyers' passage", ({ side, z }) => {
  const model = markets[0].variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  const gate = new THREE.Raycaster(new THREE.Vector3(0, 1, z), new THREE.Vector3(side, 0, 0), 0, 1.7).intersectObjects(
    model.pickables
  );
  expect(gate).toHaveLength(0);
  const corner = new THREE.Raycaster(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(side, 0, 0),
    0,
    1.7
  ).intersectObjects(model.pickables);
  expect(corner.length).toBeGreaterThan(0);
  model.dispose();
});
