import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as abbeys } from "./32-abbey-living-quartersModels";
import { models as pottery } from "./34-pottery-workshopsModels";

const domestic = abbeys.find(m => m.id === "abbey-domestic-range")!;
it.each([domestic, ...pottery])("$id High fits, projects, owns resources and retains Low/default", definition => {
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
  expect(model.pickables.length).toBeLessThanOrEqual(11);
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

it.each([domestic, ...pottery])("$id components retain their identities and can be generated alone", definition => {
  const factories = definition.parts!(definition.variants![1].id),
    full = definition.variants![1].create();
  expect(factories.length).toBe(definition === domestic ? 8 : 3);
  expect(full.group.userData.modelParts.map((p: { id: string }) => p.id)).toEqual(factories.map(p => p.id));
  for (const factory of factories) {
    const model = definition.assembleParts!([factory]);
    expect(model.group.userData.modelParts).toHaveLength(1);
    expect(model.group.userData.modelParts[0].quality).toBe("high");
    model.dispose();
  }
  full.dispose();
});

it("domestic cloister connects to the ranges and keeps the southern entry open", () => {
  const model = domestic.variants![1].create();
  model.group.updateMatrixWorld(true);
  const entry = new THREE.Raycaster(
    new THREE.Vector3(0, 1.3, 12),
    new THREE.Vector3(0, 0, -1),
    0,
    5.5
  ).intersectObjects(model.pickables);
  expect(entry).toHaveLength(0);
  // The north domestic range has the door generated at the shared cloister edge.
  const door = new THREE.Raycaster(
    new THREE.Vector3(0, 1.3, -6.7),
    new THREE.Vector3(0, 0, -1),
    0,
    0.7
  ).intersectObjects(model.pickables);
  expect(door).toHaveLength(0);
  const flue = new THREE.Raycaster(new THREE.Vector3(-6, 9, 8.7), new THREE.Vector3(0, -1, 0), 0, 3).intersectObjects(
    model.pickables
  );
  expect(flue).toHaveLength(0);
  model.dispose();
});

it("dormitory stair enters an actual opening and meets the upper floor", () => {
  const factory = domestic.parts!(domestic.variants![1].id).find(p => p.role === "furnishings")!;
  const model = factory.create();
  model.group.updateMatrixWorld(true);
  const top = new THREE.Raycaster(
    new THREE.Vector3(-2.08, 3.4, -9),
    new THREE.Vector3(0, -1, 0),
    0,
    1
  ).intersectObjects(model.pickables)[0];
  expect(top.point.y).toBeCloseTo(2.925, 5);
  const opening = new THREE.Raycaster(
    new THREE.Vector3(-4.4, 3.4, -9),
    new THREE.Vector3(0, -1, 0),
    0,
    2.5
  ).intersectObjects(model.pickables)[0];
  expect(opening.point.y).toBeLessThan(2);
  model.dispose();
});

it("pottery kiln has separate open fire and ware passages, a raised floor and a top vent", () => {
  const factory = pottery[0].parts!(pottery[0].variants![1].id).find(p => p.role === "kiln")!;
  const model = factory.create();
  model.group.updateMatrixWorld(true);
  for (const y of [0.55, 0.9, 1.7, 2.2]) {
    const hole = new THREE.Raycaster(new THREE.Vector3(4, y, 2), new THREE.Vector3(0, 0, -1), 0, 1.8).intersectObjects(
      model.pickables
    );
    expect(hole).toHaveLength(0);
  }
  const side = new THREE.Raycaster(new THREE.Vector3(4.6, 1.7, 2), new THREE.Vector3(0, 0, -1), 0, 1).intersectObjects(
    model.pickables
  );
  expect(side.length).toBeGreaterThan(0);
  const vent = new THREE.Raycaster(new THREE.Vector3(4, 4, 0), new THREE.Vector3(0, -1, 0), 0, 1.8).intersectObjects(
    model.pickables
  );
  expect(vent).toHaveLength(0);
  const floor = new THREE.Raycaster(new THREE.Vector3(4, 1.6, 0), new THREE.Vector3(0, -1, 0), 0, 0.5).intersectObjects(
    model.pickables
  )[0];
  expect(floor.point.y).toBeCloseTo(1.32, 5);
  model.dispose();
});

it("drying vessels have open mouths and stand on shelf surfaces", () => {
  const model = pottery[0].parts!(pottery[0].variants![1].id)
    .find(p => p.role === "equipment")!
    .create();
  model.group.updateMatrixWorld(true);
  const mouth = new THREE.Raycaster(
    new THREE.Vector3(-4.3, 1.1, -2.7),
    new THREE.Vector3(0, -1, 0),
    0,
    0.6
  ).intersectObjects(model.pickables)[0];
  expect(mouth.point.y).toBeCloseTo(0.645, 5);
  const shelf = new THREE.Raycaster(
    new THREE.Vector3(-4.3, 0.59, -2.7),
    new THREE.Vector3(0, 1, 0),
    0,
    0.03
  ).intersectObjects(model.pickables)[0];
  expect(shelf.point.y).toBeCloseTo(0.6, 5);
  model.dispose();
});

it("raw kitchen component also removes the roof from the chimney opening", () => {
  const model = domestic.parts!(domestic.variants![1].id)
    .find(p => p.role === "kitchen")!
    .create();
  model.group.updateMatrixWorld(true);
  const flue = new THREE.Raycaster(new THREE.Vector3(-6, 8.5, 8.7), new THREE.Vector3(0, -1, 0), 0, 6).intersectObject(
    model.group,
    true
  );
  expect(flue).toHaveLength(0);
  model.dispose();
});

it("pottery floor bars stay inside the circular kiln and overlap their bearing ledge", () => {
  const model = pottery[0].parts!(pottery[0].variants![1].id)
    .find(p => p.role === "kiln")!
    .create();
  model.group.updateMatrixWorld(true);
  const bars = model.pickables.filter(p => p.name === "perforated-kiln-floor-bar");
  expect(bars).toHaveLength(7);
  for (const bar of bars) {
    const positions = bar.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(bar.matrixWorld);
      expect(Math.hypot(p.x - 4, p.z)).toBeLessThan(1.3);
    }
    const z = bar.position.z,
      x = 4 + bar.scale.x / 2 - 0.03;
    const ledge = new THREE.Raycaster(
      new THREE.Vector3(x, 1.27, z),
      new THREE.Vector3(0, -1, 0),
      0,
      0.2
    ).intersectObjects(model.pickables.filter(p => p.name === "kiln-floor-bearing-ledge"));
    expect(ledge.length).toBeGreaterThan(0);
    expect(ledge[0].point.y).toBeCloseTo(1.24, 5);
  }
  model.dispose();
});
