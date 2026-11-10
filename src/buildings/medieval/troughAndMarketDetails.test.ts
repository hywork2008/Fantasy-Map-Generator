import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as troughs } from "./05-troughsModels";
import { models as stalls } from "./06-market-stallsModels";

it.each([...troughs, ...stalls])(
  "$id High fits its declared envelope, projects and owns independent resources",
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
    expect(model.pickables.length).toBeLessThanOrEqual(definition.appearances ? 12 : 8);
    for (const mesh of model.pickables)
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    for (const view of ["top", "side"] as const) {
      const drawing = meshProjection(model, view);
      expect(drawing).toContain("<path");
      expect(drawing).not.toMatch(/NaN|Infinity/);
    }
    const resources = new Set(model.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
    const spies = [...resources].map(r => vi.spyOn(r, "dispose"));
    const otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
    model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(otherDispose).not.toHaveBeenCalled();
    other.dispose();
  }
);

it("the water trough has a recessed water surface and a clear overflow notch above its solid end", () => {
  const model = troughs
    .find(m => m.id === "stone-water-trough")!
    .variants!.find(v => v.level === "high")!
    .create();
  model.group.updateMatrixWorld(true);
  const top = (z: number) =>
    new THREE.Raycaster(new THREE.Vector3(0, 1.5, z), new THREE.Vector3(0, -1, 0)).intersectObjects(model.pickables)[0];
  expect(top(0).point.y).toBeCloseTo(0.575, 4);
  expect(top(0).face!.normal.y).toBeGreaterThan(0);
  expect(top(0.43).point.y).toBeGreaterThan(0.75);
  const end = (y: number) =>
    new THREE.Raycaster(new THREE.Vector3(1.6, y, 0), new THREE.Vector3(-1, 0, 0), 0, 0.5).intersectObjects(
      model.pickables
    );
  expect(end(0.72)).toHaveLength(0);
  expect(end(0.5).length).toBeGreaterThan(0);
  model.dispose();
});

it("the fodder manger retains a feeding cavity below its rim", () => {
  const model = troughs
    .find(m => m.id === "fodder-trough")!
    .variants!.find(v => v.level === "high")!
    .create();
  model.group.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(hit.point.y).toBeLessThan(1.0);
  expect(hit.point.y).toBeGreaterThan(0.6);
  model.dispose();
});

it.each(stalls.filter(model => !model.appearances || model.id === "market-bread-stall"))(
  "$id leaves a vendor aisle below an upward-facing awning",
  definition => {
    const model = definition.variants!.find(v => v.level === "high")!.create();
    model.group.updateMatrixWorld(true);
    const aisle = new THREE.Raycaster(
      new THREE.Vector3(-2.1, 1.6, 0),
      new THREE.Vector3(1, 0, 0),
      0,
      3.6
    ).intersectObjects(model.pickables);
    expect(aisle).toHaveLength(0);
    const roof = new THREE.Raycaster(new THREE.Vector3(0.2, 5, 0.4), new THREE.Vector3(0, -1, 0)).intersectObjects(
      model.pickables
    )[0];
    expect(roof.point.y).toBeGreaterThan(2.5);
    expect(roof.face!.normal.y).toBeGreaterThan(0);
    model.dispose();
  }
);
