import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as carts } from "./09-hand-cartsModels";
import { models as bakeries } from "./10-bakeriesModels";

it.each([...carts, ...bakeries])(
  "$id High fits, projects finite geometry and owns independent resources",
  definition => {
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
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    for (const view of ["top", "side"] as const) {
      const projection = meshProjection(model, view);
      expect(projection).toContain("<path");
      expect(projection).not.toMatch(/NaN|Infinity/);
    }
    const resources = new Set(model.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose")),
      otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
    model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(otherDispose).not.toHaveBeenCalled();
    other.dispose();
  }
);

it.each([
  { id: "two-wheel-farm-cart", x: 0, y: 0.69, z: 1.2, far: 0.36, hole: 0.4, rim: 0.63 },
  { id: "wooden-wheelbarrow", x: 1, y: 0.365, z: 0.24, far: 0.43, hole: 0.2, rim: 0.305 }
])("$id has a true gap between spokes and a solid felloe", spec => {
  const model = carts
    .find(m => m.id === spec.id)!
    .variants!.find(v => v.level === "high")!
    .create();
  model.group.updateMatrixWorld(true);
  const ray = (radius: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(spec.x + Math.cos(Math.PI / 12) * radius, spec.y + Math.sin(Math.PI / 12) * radius, spec.z),
      new THREE.Vector3(0, 0, -1),
      0,
      spec.far
    ).intersectObjects(model.pickables);
  expect(ray(spec.hole)).toHaveLength(0);
  expect(ray(spec.rim).length).toBeGreaterThan(0);
  model.dispose();
});

it.each([
  { id: "two-wheel-farm-cart", limit: 1.1 },
  { id: "wooden-wheelbarrow", limit: 0.85 }
])("$id leaves its loading space open above the deck", ({ id, limit }) => {
  const model = carts
    .find(m => m.id === id)!
    .variants!.find(v => v.level === "high")!
    .create();
  model.group.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(new THREE.Vector3(0.3, 3, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(hit.point.y).toBeLessThan(limit);
  expect(hit.face!.normal.y).toBeGreaterThan(0);
  model.dispose();
});

it.each([
  { id: "bread-bakehouse", x: 3, z: 0 },
  { id: "town-bakery", x: 4, z: -0.5 },
  { id: "communal-bread-oven", x: 0, z: -0.5 }
])("$id has an open arched mouth leading into an enclosed oven chamber", spec => {
  const model = bakeries
    .find(m => m.id === spec.id)!
    .variants!.find(v => v.level === "high")!
    .create();
  model.group.updateMatrixWorld(true);
  const ray = (dx: number, far: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(spec.x + dx, 1.15, spec.z + 1.3),
      new THREE.Vector3(0, 0, -1),
      0,
      far
    ).intersectObjects(model.pickables);
  expect(ray(0, 0.8)).toHaveLength(0);
  expect(ray(0.57, 0.8).length).toBeGreaterThan(0);
  expect(ray(0, 2.5).length).toBeGreaterThan(0);
  model.dispose();
});

it.each([
  { id: "bread-bakehouse", x: 3, z: 0 },
  { id: "town-bakery", x: 4, z: -0.5 },
  { id: "communal-bread-oven", x: 0, z: -0.5 }
])("$id chimney is supported down to the oven pedestal", spec => {
  const model = bakeries
    .find(m => m.id === spec.id)!
    .variants!.find(v => v.level === "high")!
    .create();
  model.group.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(
    new THREE.Vector3(spec.x + 1.4, 1.0, spec.z - 0.4),
    new THREE.Vector3(-1, 0, 0),
    0,
    0.6
  ).intersectObjects(model.pickables)[0];
  expect(hit).toBeTruthy();
  expect(hit.point.x).toBeGreaterThanOrEqual(spec.x + 1.0);
  model.dispose();
});
