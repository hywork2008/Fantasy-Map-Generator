import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adopt, adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as smithies } from "./11-smithiesModels";
import { models as inns } from "./12-innsModels";
import { MEDIEVAL_VARIANTS } from "./medievalVariants";

it.each([...smithies, ...inns])("$id High fits, projects and owns independent resources", definition => {
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
  expect(model.pickables.length).toBeLessThanOrEqual(definition.task === 12 ? 14 : 11);
  for (const mesh of model.pickables)
    for (const attribute of ["position", "normal"])
      expect(Array.from(mesh.geometry.getAttribute(attribute).array).every(Number.isFinite)).toBe(true);
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

it.each(smithies)("$id leaves its hearth, chimney and anvil hardy hole open", definition => {
  const model = definition.variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  const hearth = (x: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 1.4, -0.5), new THREE.Vector3(0, 0, -1), 0, 1.2).intersectObjects(
      model.pickables
    );
  expect(hearth(-2)).toHaveLength(0);
  expect(hearth(-2.9).length).toBeGreaterThan(0);
  // The smoke route must pass the tiles and roof underlay as well as the flue cap.
  const chimney = (x: number, far: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 5.7, -2.1), new THREE.Vector3(0, -1, 0), 0, far).intersectObjects(
      model.pickables
    );
  expect(chimney(-2, 4.1)).toHaveLength(0);
  expect(chimney(-1.67, 0.5).length).toBeGreaterThan(0);
  const hardy = (x: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 1.4, 0.9), new THREE.Vector3(0, -1, 0), 0, 0.4).intersectObjects(
      model.pickables
    );
  expect(hardy(-0.235)).toHaveLength(0);
  expect(hardy(0).length).toBeGreaterThan(0);
  const water = new THREE.Raycaster(new THREE.Vector3(1.4, 1, 1.9), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(water.point.y).toBeCloseTo(0.478, 4);
  model.dispose();
});

it.each(inns)("$id keeps the court entrance and stable bays accessible", definition => {
  const model = definition.variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  const entrance = new THREE.Raycaster(
    new THREE.Vector3(0, 1.4, 5.4),
    new THREE.Vector3(0, 0, -1),
    0,
    6.2
  ).intersectObjects(model.pickables);
  expect(entrance).toHaveLength(0);
  const wall = new THREE.Raycaster(new THREE.Vector3(1.1, 1.4, 0), new THREE.Vector3(0, 0, -1), 0, 1).intersectObjects(
    model.pickables
  );
  expect(wall.length).toBeGreaterThan(0);
  const stable = new THREE.Raycaster(
    new THREE.Vector3(-4, 1.3, 2.025),
    new THREE.Vector3(-1, 0, 0),
    0,
    0.7
  ).intersectObjects(model.pickables);
  expect(stable).toHaveLength(0);
  model.dispose();
});

it("the shoeing stock has a clear entry above its lower slings", () => {
  const model = smithies[1].variants!.find(v => v.level === "high")!.create();
  model.group.updateMatrixWorld(true);
  const ray = (x: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 1.6, 3.5), new THREE.Vector3(0, 0, -1), 0, 2.3).intersectObjects(
      model.pickables
    );
  expect(ray(3.3)).toHaveLength(0);
  expect(ray(2.5).length).toBeGreaterThan(0);
  model.dispose();
});

it.each(smithies)("$id preserves the original CE default factory", definition => {
  const old = adopt(MEDIEVAL_VARIANTS, `medieval.${definition.id}`, "default");
  expect(old.id).toBe(`medieval.${definition.id}@default#codex-gpt-6.1-sol`);
  expect(medievalDefinition(definition).variant).toBe(old.id);
  const model = old.create();
  expect(model.group.name).toBe(definition.id === "open-smithy" ? "smithy" : "farrier");
  model.dispose();
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
});
