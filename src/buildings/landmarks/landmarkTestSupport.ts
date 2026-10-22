import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { meshProjection } from "../meshProjection";
import type { LandmarkModel } from "./architectureKit";

/** Contract checks protect BV framing, finite SVG projections and resource ownership. */
export function checkLandmark(model: LandmarkModel, inspect: (meshes: ReturnType<LandmarkModel["create"]>) => void) {
  it(`${model.task}: grounds and frames ${model.name}, projects both views and disposes its resources`, () => {
    const assembly = model.create();
    assembly.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(assembly.group);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0, 4);
    for (const [actual, limit] of [
      [size.x, model.size[0]],
      [size.z, model.size[1]],
      [bounds.max.y, model.size[2]]
    ]) {
      expect(actual).toBeGreaterThan(0);
      expect(actual).toBeLessThanOrEqual(limit + 0.01);
    }
    for (const mesh of assembly.pickables) {
      expect(mesh.parent).toBeTruthy();
      const vertices = mesh.geometry.getAttribute("position");
      expect(Array.from(vertices.array).every(Number.isFinite)).toBe(true);
    }
    inspect(assembly);
    for (const view of ["top", "side"] as const) {
      const svg = meshProjection(assembly, view);
      expect(svg).toContain("<path");
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
    const geometries = new Set(assembly.pickables.map(mesh => mesh.geometry));
    const materials = new Set(assembly.pickables.flatMap(mesh => mesh.material));
    const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, "dispose"));
    assembly.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
}

export function heightAt(assembly: ReturnType<LandmarkModel["create"]>, x: number, z: number) {
  const hit = new THREE.Raycaster(new THREE.Vector3(x, 250, z), new THREE.Vector3(0, -1, 0)).intersectObjects(
    assembly.pickables
  )[0];
  return hit?.point.y ?? 0;
}
