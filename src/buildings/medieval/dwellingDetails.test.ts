import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adopt, adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as dwellings } from "./07-dwellingsModels";
import { models as shops } from "./08-shop-housesModels";
import { MEDIEVAL_VARIANTS } from "./medievalVariants";

it.each([...dwellings, ...shops])("$id High fits, projects finite geometry and owns its resources", definition => {
  const high = definition.variants!.find(v => v.level === "high")!;
  expect(adoptedVariant(high.family, "high").id).toBe(high.id);
  const model = high.create(),
    other = high.create();
  const bounds = new THREE.Box3().setFromObject(model.group, true),
    size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(0, 5);
  for (const [actual, limit] of [
    [size.x, definition.size[0]],
    [size.z, definition.size[1]],
    [size.y, definition.size[2]]
  ])
    expect(actual).toBeLessThanOrEqual(limit + 0.00001);
  expect(model.pickables.length).toBeLessThanOrEqual(11);
  for (const mesh of model.pickables)
    for (const name of ["position", "normal"])
      expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
  for (const view of ["top", "side"] as const) {
    const drawing = meshProjection(model, view);
    expect(drawing).toContain("<path");
    expect(drawing).not.toMatch(/NaN|Infinity/);
  }
  const resources = new Set(model.pickables.flatMap(m => [m.geometry, ...[m.material].flat()]));
  const spies = [...resources].map(r => vi.spyOn(r, "dispose")),
    otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(otherDispose).not.toHaveBeenCalled();
  other.dispose();
});

const previews = [
  {
    id: "half-timber-farmhouse",
    x: -1,
    front: 2,
    wallX: 0.2,
    roofX: 0,
    roofZ: 0,
    chimneyX: -2,
    chimneyZ: -2,
    top: 7.6
  },
  { id: "stone-cottage", x: -1, front: 2.5, wallX: 0.1, roofX: 0, roofZ: 1, chimneyX: -2, chimneyZ: -1, top: 5.3 },
  {
    id: "plastered-small-house",
    x: 0.65,
    front: 2.15,
    wallX: -0.1,
    roofX: 0,
    roofZ: 1,
    chimneyX: 1,
    chimneyZ: -1,
    top: 6.5
  },
  {
    id: "merchant-shop-house",
    x: 1.9,
    front: 1,
    wallX: 1,
    roofX: 0,
    roofZ: -0.5,
    chimneyX: 1.7,
    chimneyZ: -2.2,
    top: 7.9
  },
  {
    id: "artisan-shop-house",
    x: 1.9,
    front: 1.25,
    wallX: 1,
    roofX: 0,
    roofZ: 0,
    chimneyX: 1.7,
    chimneyZ: -1.7,
    top: 7.1
  }
];
it.each(previews)("$id has a clear doorway, outward roof and open chimney flue", spec => {
  const model = [...dwellings, ...shops]
    .find(m => m.id === spec.id)!
    .variants!.find(v => v.level === "high")!
    .create();
  model.group.updateMatrixWorld(true);
  const door = (x: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(x, 1.2, spec.front + 0.25),
      new THREE.Vector3(0, 0, -1),
      0,
      0.55
    ).intersectObjects(model.pickables);
  expect(door(spec.x)).toHaveLength(0);
  expect(door(spec.wallX).length).toBeGreaterThan(0);
  const roof = new THREE.Raycaster(
    new THREE.Vector3(spec.roofX, 12, spec.roofZ),
    new THREE.Vector3(0, -1, 0)
  ).intersectObjects(model.pickables)[0];
  expect(roof.face!.normal.y).toBeGreaterThan(0);
  const flue = (x: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(x, spec.top + 0.2, spec.chimneyZ),
      new THREE.Vector3(0, -1, 0),
      0,
      0.45
    ).intersectObjects(model.pickables);
  expect(flue(spec.chimneyX)).toHaveLength(0);
  expect(flue(spec.chimneyX + 0.33).length).toBeGreaterThan(0);
  model.dispose();
});

it.each(shops)("$id shop aperture is open through the facade", definition => {
  const front = definition.id === "merchant-shop-house" ? 1 : 1.25;
  const model = definition.variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  const hits = new THREE.Raycaster(
    new THREE.Vector3(-1.15, 1.5, front + 0.2),
    new THREE.Vector3(0, 0, -1),
    0,
    0.45
  ).intersectObjects(model.pickables);
  expect(hits).toHaveLength(0);
  model.dispose();
});

it.each(dwellings)("$id preserves its existing default CE factory and variant identity", definition => {
  const variant = adopt(MEDIEVAL_VARIANTS, `medieval.${definition.id}`, "default");
  expect(variant.id).toBe(`medieval.${definition.id}@default#codex-gpt-6.1-sol`);
  expect(medievalDefinition(definition).variant).toBe(variant.id);
  const old = variant.create();
  expect(old.group.name).toBe(definition.id);
  old.dispose();
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
});
