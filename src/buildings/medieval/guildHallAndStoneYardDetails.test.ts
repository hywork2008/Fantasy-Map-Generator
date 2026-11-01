import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as cloth } from "./27-cloth-hallsModels";
import { models as guilds } from "./28-craft-guild-hallsModels";
import { models as yards } from "./29-stone-yardsModels";
import { GUILD_HALL_PROFILE } from "./civicHallProfile";

it.each([...guilds, ...yards])("$id High fits, renders independently and preserves its CE default", definition => {
  const model = definition.variants![1].create(),
    other = definition.variants![1].create();
  const box = new THREE.Box3().setFromObject(model.group, true),
    size = box.getSize(new THREE.Vector3());
  expect(box.min.y).toBeCloseTo(0, 5);
  for (const [actual, limit] of [
    [size.x, definition.size[0]],
    [size.z, definition.size[1]],
    [size.y, definition.size[2]]
  ])
    expect(actual).toBeLessThanOrEqual(limit + 0.00001);
  expect(model.pickables.length).toBeLessThanOrEqual(12);
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

it.each(guilds)("$id shares cloth hall height, stair placement, masonry supports and doorway clearance", definition => {
  const model = definition.variants![1].create(),
    reference = cloth[0].variants![1].create();
  model.group.updateMatrixWorld(true);
  reference.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group, true),
    other = new THREE.Box3().setFromObject(reference.group, true);
  expect(bounds.min.toArray()).toEqual(other.min.toArray());
  expect(bounds.max.toArray()).toEqual(other.max.toArray());
  expect(GUILD_HALL_PROFILE.support).toBe("masonry-arcade");
  expect(GUILD_HALL_PROFILE.stairSide).toBe("east");
  const stairs = definition.parts!(definition.variants![1].id)
    .find(p => p.role === "exterior-stair")!
    .create();
  const clothStairs = cloth[0].parts!(cloth[0].variants![1].id)
    .find(p => p.role === "exterior-stair")!
    .create();
  expect(stairs.pickables.length).toBe(clothStairs.pickables.length);
  stairs.group.updateMatrixWorld(true);
  clothStairs.group.updateMatrixWorld(true);
  for (let i = 0; i < stairs.pickables.length; i++) {
    const a = stairs.pickables[i],
      b = clothStairs.pickables[i];
    expect(Array.from(a.geometry.attributes.position.array)).toEqual(Array.from(b.geometry.attributes.position.array));
    expect(a.matrixWorld.elements).toEqual(b.matrixWorld.elements);
  }
  for (const x of [-3.75, 0, 3.75]) {
    const pier = new THREE.Raycaster(new THREE.Vector3(x, 1.5, 4), new THREE.Vector3(0, 0, -1), 0, 1).intersectObjects(
      model.pickables
    );
    expect(pier.length).toBeGreaterThan(0);
  }
  const opening = new THREE.Raycaster(
    new THREE.Vector3(-5.625, 1.5, 4),
    new THREE.Vector3(0, 0, -1),
    0,
    1
  ).intersectObjects(model.pickables);
  expect(opening).toHaveLength(0);
  for (const z of [-2.8, -2.3, -1.8])
    for (const y of [3.7, 4.1, 4.27, 4.5]) {
      const door = new THREE.Raycaster(
        new THREE.Vector3(8.36, y, z),
        new THREE.Vector3(-1, 0, 0),
        0,
        0.855
      ).intersectObjects(model.pickables);
      expect(door).toHaveLength(0);
    }
  const plaqueDoor = new THREE.Raycaster(
    new THREE.Vector3(0, 5.3, 4),
    new THREE.Vector3(0, 0, -1),
    0,
    0.7
  ).intersectObjects(model.pickables);
  expect(plaqueDoor).toHaveLength(0);
  expect(model.group.userData.modelParts.map((p: { role: string }) => p.role)).toEqual([
    "architecture",
    "exterior-stair",
    "trade-dressing"
  ]);
  stairs.dispose();
  clothStairs.dispose();
  model.dispose();
  reference.dispose();
});

it("stone dressing block sits on its workbench and leaves the receiving path open", () => {
  const model = yards[0].variants![1].create();
  model.group.updateMatrixWorld(true);
  const top = new THREE.Raycaster(new THREE.Vector3(-3, 2, -1.4), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(top.point.y).toBeCloseTo(1.35, 5);
  const underneath = new THREE.Raycaster(
    new THREE.Vector3(-3, 0.94, -1.4),
    new THREE.Vector3(0, 1, 0),
    0,
    0.04
  ).intersectObjects(model.pickables)[0];
  expect(underneath.point.y).toBeCloseTo(0.95, 5);
  const path = new THREE.Raycaster(new THREE.Vector3(0.7, 1, 4.5), new THREE.Vector3(0, 0, -1), 0, 7).intersectObjects(
    model.pickables
  );
  expect(path).toHaveLength(0);
  model.dispose();
});
