import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { adoptedVariant } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as boundaries } from "./02-boundariesModels";
import { models as animals } from "./04-animal-housingModels";

it.each([...boundaries, ...animals])(
  "$id High fits its envelope, draws finite projections and owns independent resources",
  definition => {
    const high = definition.variants!.find(v => v.level === "high")!;
    const low = definition.variants!.find(v => v.level === "low")!;
    expect(adoptedVariant(high.family, "high").id).toBe(high.id);
    expect(adoptedVariant(low.family, "low").id).toBe(low.id);
    const model = high.create(),
      other = high.create();
    const basic = low.create();
    const bounds = new THREE.Box3().setFromObject(model.group, true);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0, 5);
    for (const [value, limit] of [
      [size.x, definition.size[0]],
      [size.z, definition.size[1]],
      [size.y, definition.size[2]]
    ])
      expect(value).toBeLessThanOrEqual(limit + 0.00001);
    expect(collectModelMetrics(model.group).triangles).toBeGreaterThan(collectModelMetrics(basic.group).triangles);
    expect(model.pickables.length).toBeLessThanOrEqual(8);
    for (const mesh of model.pickables)
      for (const attribute of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(attribute).array).every(Number.isFinite)).toBe(true);
    for (const view of ["top", "side"] as const) {
      const projection = meshProjection(model, view);
      expect(projection).toContain("<path");
      expect(projection).not.toMatch(/NaN|Infinity|undefined/);
    }
    const resources = new Set(model.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    const otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
    model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(otherDispose).not.toHaveBeenCalled();
    other.dispose();
    basic.dispose();
  }
);

it.each([
  { id: "village-stable", x: -3.75, y: 1.5, z: 2.3, distance: 1.1, blockedX: -2.5 },
  { id: "cattle-byre", x: 0, y: 1.4, z: 2.1, distance: 1.3, blockedX: 2 },
  { id: "pigsty", x: 0, y: 0.6, z: 0.4, distance: 1.1, blockedX: 1 },
  { id: "chicken-coop", x: 0, y: 1.5, z: 1.2, distance: 0.5, blockedX: -0.7 }
])("$id has an open animal entrance beside a solid wall or post", ({ id, x, y, z, distance, blockedX }) => {
  const model = animals
    .find(m => m.id === id)!
    .variants!.find(v => v.level === "high")!
    .create();
  model.group.updateMatrixWorld(true);
  const hits = (xx: number) =>
    new THREE.Raycaster(new THREE.Vector3(xx, y, z), new THREE.Vector3(0, 0, -1), 0, distance).intersectObjects(
      model.pickables
    );
  expect(hits(x)).toHaveLength(0);
  expect(hits(blockedX).length).toBeGreaterThan(0);
  model.dispose();
});

it("animal roofs present upward-facing outer surfaces", () => {
  for (const definition of animals) {
    const model = definition.variants!.find(v => v.level === "high")!.create();
    model.group.updateMatrixWorld(true);
    const hit = new THREE.Raycaster(
      new THREE.Vector3(0.6, 10, definition.id === "chicken-coop" ? 0.6 : 0),
      new THREE.Vector3(0, -1, 0)
    ).intersectObjects(model.pickables)[0];
    expect(hit).toBeTruthy();
    expect(hit.face!.normal.y).toBeGreaterThan(0);
    model.dispose();
  }
});
