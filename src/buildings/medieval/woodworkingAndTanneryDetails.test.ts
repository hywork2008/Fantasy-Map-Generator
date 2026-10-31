import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as workshops } from "./21-woodworking-workshopsModels";
import { models as tanneries } from "./22-tanneriesModels";

it.each([...workshops, ...tanneries])("$id High fits, projects and owns independent resources", definition => {
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
  const low = definition.variants![0].create(),
    original = definition.create();
  expect(low.group.name).toBe(original.group.name);
  expect(low.pickables.length).toBe(original.pickables.length);
  low.dispose();
  original.dispose();
});

it("tannery retains its existing CE default identity", () => {
  expect(medievalDefinition(tanneries[0]).variant).toBe("medieval.tanners-yard@default#codex-gpt-6.1-sol");
});

it("unfinished cooper barrel has a real open mouth, visible side gap and a wooden bottom", () => {
  const model = workshops[0].variants![1].create();
  model.group.updateMatrixWorld(true);
  const down = new THREE.Raycaster(new THREE.Vector3(-0.9, 2.2, 0), new THREE.Vector3(0, -1, 0), 0, 2).intersectObjects(
    model.pickables
  )[0];
  expect(down.point.y).toBeCloseTo(0.72 + 0.045 * 1.35 + 0.0175, 5);
  const direction = new THREE.Vector3(-1, 0, -1).normalize();
  const gap = new THREE.Raycaster(new THREE.Vector3(0.1, 1.45, 1), direction, 0, 1.45).intersectObjects(
    model.pickables
  );
  expect(gap).toHaveLength(0);
  const wall = new THREE.Raycaster(
    new THREE.Vector3(-1.9, 1.45, 0),
    new THREE.Vector3(1, 0, 0),
    0,
    0.7
  ).intersectObjects(model.pickables);
  expect(wall.length).toBeGreaterThan(0);
  model.dispose();
});

it("joiner vice has open clearance between its jaws above the screw", () => {
  const model = workshops[1].variants![1].create();
  model.group.updateMatrixWorld(true);
  const gap = new THREE.Raycaster(
    new THREE.Vector3(-1.15, 1.2, 0.88),
    new THREE.Vector3(0, -1, 0),
    0,
    0.36
  ).intersectObjects(model.pickables);
  expect(gap).toHaveLength(0);
  const jaw = new THREE.Raycaster(
    new THREE.Vector3(-1.15, 1.2, 1.02),
    new THREE.Vector3(0, -1, 0),
    0,
    0.36
  ).intersectObjects(model.pickables);
  expect(jaw.length).toBeGreaterThan(0);
  model.dispose();
});

it("tannery vats and basin have liquid below the rim and an unobstructed working aisle", () => {
  const model = tanneries[0].variants![1].create();
  model.group.updateMatrixWorld(true);
  for (let i = 0; i < 4; i++) {
    const x = -4.7 + i * 2.9;
    const top = new THREE.Raycaster(new THREE.Vector3(x, 1.8, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
      model.pickables
    )[0];
    expect(top.point.y).toBeCloseTo(0.745, 5);
  }
  const water = new THREE.Raycaster(new THREE.Vector3(-4.55, 1.2, 3.3), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(water.point.y).toBeCloseTo(0.69, 5);
  const aisle = new THREE.Raycaster(
    new THREE.Vector3(-6, 0.8, 1.8),
    new THREE.Vector3(1, 0, 0),
    0,
    12
  ).intersectObjects(model.pickables);
  expect(aisle).toHaveLength(0);
  model.dispose();
});
