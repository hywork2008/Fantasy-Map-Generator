import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { adoptedVariant } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models } from "./03-barnsModels";

it.each(models)(
  "$id High preserves the envelope and has finite drawings with independent resource ownership",
  definition => {
    const high = definition.variants!.find(variant => variant.level === "high")!;
    expect(adoptedVariant(high.family, "high").id).toBe(high.id);
    const model = high.create();
    const other = high.create();
    const low = definition.create();
    const bounds = new THREE.Box3().setFromObject(model.group, true);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0, 5);
    for (const [actual, limit] of [
      [size.x, definition.size[0]],
      [size.z, definition.size[1]],
      [size.y, definition.size[2]]
    ])
      expect(actual).toBeLessThanOrEqual(limit);
    const metrics = collectModelMetrics(model.group);
    expect(metrics.triangles).toBeGreaterThan(collectModelMetrics(low.group).triangles * 2);
    expect(metrics.meshes).toBeLessThanOrEqual(7);
    for (const mesh of model.pickables)
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    for (const view of ["side", "top"] as const) expect(meshProjection(model, view)).not.toMatch(/NaN|Infinity/);
    const resources = new Set(model.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
    const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    const otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
    model.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
    expect(otherDispose).not.toHaveBeenCalled();
    other.dispose();
    low.dispose();
  }
);

it.each(models.filter(model => model.id !== "hay-shelter"))(
  "$id High has a clear cross-passage through its open doors",
  definition => {
    const model = definition.variants!.find(variant => variant.level === "high")!.create();
    model.group.updateMatrixWorld(true);
    const ray = (x: number) =>
      new THREE.Raycaster(new THREE.Vector3(x, 1.4, 9), new THREE.Vector3(0, 0, -1)).intersectObjects(model.pickables);
    expect(ray(0)).toHaveLength(0);
    expect(ray(3)).not.toHaveLength(0);
    model.dispose();
  }
);
