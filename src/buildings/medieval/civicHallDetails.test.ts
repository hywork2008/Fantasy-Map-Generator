import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as civic } from "./26-civic-hallsModels";
import { models as cloth } from "./27-cloth-hallsModels";

it.each([...civic, ...cloth])("$id High fits, projects and owns independent resources", definition => {
  const variant = definition.variants![1];
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
  const low = definition.variants![0].create(),
    original = definition.create();
  expect(low.group.name).toBe(original.group.name);
  expect(low.pickables.length).toBe(original.pickables.length);
  low.dispose();
  original.dispose();
});

it("cloth hall keeps its original CE default identity", () => {
  expect(medievalDefinition(cloth[0]).variant).toBe("medieval.cloth-guild-hall@default#codex-gpt-6.1-sol");
});

it.each([...civic, ...cloth])("$id has open ground bays and usable upper doors", definition => {
  const model = definition.variants![1].create();
  model.group.updateMatrixWorld(true);
  const market = definition.id === "covered-market-hall",
    w = definition.id === "medieval-town-hall" ? 12 : market ? 14 : 15,
    d = market ? 6 : 7;
  const across = (x: number, y: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, y, d / 2 + 0.5), new THREE.Vector3(0, 0, -1), 0, 1).intersectObjects(
      model.pickables
    );
  expect(across(-w * 0.375, 1.5)).toHaveLength(0);
  expect(across(market ? -w / 2 : -w / 4, 1.5).length).toBeGreaterThan(0);
  if (!market) expect(across(-w * 0.375, 2.96).length).toBeGreaterThan(0);
  expect(across(0, 4.5)).toHaveLength(0);
  const landingDoor = new THREE.Raycaster(
    new THREE.Vector3(w / 2 + 0.4, 4.5, -2.3),
    new THREE.Vector3(-1, 0, 0),
    0,
    0.75
  ).intersectObjects(model.pickables);
  expect(landingDoor).toHaveLength(0);
  model.dispose();
});

it.each([...civic, ...cloth])("$id balcony and landing piers meet their decks", definition => {
  const model = definition.variants![1].create();
  model.group.updateMatrixWorld(true);
  const market = definition.id === "covered-market-hall",
    w = definition.id === "medieval-town-hall" ? 12 : market ? 14 : 15,
    d = market ? 6 : 7;
  // The same vertical line must meet deck underside and pier top at the joint.
  for (const [x, z] of [
    [-1.1, d / 2 + 0.98],
    [1.1, d / 2 + 0.98],
    [w / 2 + 0.26, -2.3],
    [w / 2 + 1.46, -2.3]
  ]) {
    const up = new THREE.Raycaster(new THREE.Vector3(x, 3.1, z), new THREE.Vector3(0, 1, 0), 0, 0.3).intersectObjects(
      model.pickables
    )[0];
    const down = new THREE.Raycaster(
      new THREE.Vector3(x, 3.18, z),
      new THREE.Vector3(0, -1, 0),
      0,
      0.3
    ).intersectObjects(model.pickables)[0];
    expect(up).toBeDefined();
    expect(down).toBeDefined();
    expect(up.point.y).toBeCloseTo(3.14, 4);
    expect(down.point.y).toBeCloseTo(3.14, 4);
  }
  model.dispose();
});

it("town bell turret stays open at bell height and has no main roof through its chamber", () => {
  const model = civic[0].variants![1].create();
  model.group.updateMatrixWorld(true);
  const opening = new THREE.Raycaster(
    new THREE.Vector3(0.45, 10.8, 1.4),
    new THREE.Vector3(0, 0, -1),
    0,
    2.8
  ).intersectObjects(model.pickables);
  expect(opening).toHaveLength(0);
  const chamber = new THREE.Raycaster(
    new THREE.Vector3(0.43, 11.3, 0.3),
    new THREE.Vector3(0, -1, 0),
    0,
    1.5
  ).intersectObjects(model.pickables)[0];
  expect(chamber.point.y).toBeCloseTo(9.96, 4);
  model.dispose();
});

it.each([...civic, ...cloth])(
  "$id exposes its shared stair independently and leaves the doorway passage clear",
  definition => {
    const high = definition.variants![1];
    const factories = definition.parts!(high.id);
    const roles =
      definition.id === "cloth-guild-hall"
        ? ["architecture", "exterior-stair", "trade-dressing"]
        : ["architecture", "exterior-stair"];
    expect(factories.map(part => part.role)).toEqual(roles);
    const model = high.create();
    model.group.updateMatrixWorld(true);
    const width = definition.id === "medieval-town-hall" ? 12 : definition.id === "covered-market-hall" ? 14 : 15;
    for (const z of [-2.8, -2.55, -2.3, -2.05, -1.8])
      for (let y = 3.6; y <= 5.21; y += 0.04) {
        const door = new THREE.Raycaster(
          new THREE.Vector3(width / 2 + 0.86, y, z),
          new THREE.Vector3(-1, 0, 0),
          0,
          0.855
        ).intersectObjects(model.pickables);
        expect(door).toHaveLength(0);
      }
    const stair = definition.assembleParts!([factories[1]]);
    const ledger = stair.group.userData.modelParts;
    expect(ledger).toHaveLength(1);
    expect(ledger[0].role).toBe("exterior-stair");
    expect(ledger[0].quality).toBe("high");
    expect(model.group.userData.modelParts.map((part: { role: string }) => part.role)).toEqual(roles);
    expect(
      stair.pickables.every(mesh =>
        mesh.userData.modelPartRanges.every((range: { partId: string }) => range.partId === factories[1].id)
      )
    ).toBe(true);
    const bounds = new THREE.Box3().setFromObject(stair.group, true);
    expect(bounds.min.x).toBeCloseTo(width / 2, 5);
    expect(bounds.max.y).toBeCloseTo(4.31, 4);
    stair.dispose();
    model.dispose();
  }
);
