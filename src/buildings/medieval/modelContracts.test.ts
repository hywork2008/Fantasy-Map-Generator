import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { meshProjection } from "../meshProjection";
import type { MedievalModel } from "./modelKit";

const modules = import.meta.glob<{ models: MedievalModel[] }>("./*Models.ts", { eager: true });
const requested = process.env.MEDIEVAL_MODEL_TASK?.split(",").map(Number);
const models = Object.values(modules)
  .flatMap(module => module.models)
  .filter(model => !requested || requested.includes(model.task));
expect(models.length).toBeGreaterThan(0);
describe.each(models)("$id", definition => {
  it("has finite, pickable, grounded geometry inside the declared meter envelope and valid drawings", () => {
    const model = definition.create();
    const bounds = new THREE.Box3().setFromObject(model.group, true);
    const size = bounds.getSize(new THREE.Vector3());
    expect(Math.abs(bounds.min.y)).toBeLessThan(0.0001);
    expect(size.x).toBeLessThanOrEqual(definition.size[0] + 0.0001);
    expect(size.z).toBeLessThanOrEqual(definition.size[1] + 0.0001);
    expect(size.y).toBeLessThanOrEqual(definition.size[2] + 0.0001);
    // A slab or continuous boundary may legitimately be a single rendered mesh.
    expect(model.pickables.length).toBeGreaterThan(0);
    for (const mesh of model.pickables)
      expect(Array.from(mesh.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    for (const view of ["side", "top"] as const) {
      const drawing = meshProjection(model, view);
      expect(drawing).toContain("<path");
      expect(drawing).not.toMatch(/NaN|Infinity|undefined/);
    }
    model.dispose();
  });
  it("owns its resources and disposes each rendered geometry and material exactly once", () => {
    const model = definition.create(),
      other = definition.create();
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const mesh of model.pickables) {
      resources.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(material);
    }
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    const otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
    model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(otherDispose).not.toHaveBeenCalled();
    other.dispose();
  });
});
