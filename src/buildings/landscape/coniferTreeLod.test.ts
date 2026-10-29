import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedTree } from "../../city3d/adoption";
import { createBvPrototypeCache } from "../../city3d/three/bvInstances";
import { TREE_QUALITIES } from "./treeQuality";

it.each(["western_red_cedar", "silver_fir", "date_palm", "umbrella_thorn", "saxaul", "tamarisk", "olive"] as const)(
  "keeps %s tier envelopes grounded, finite and owned independently",
  species => {
    const reference = adoptedTree(species, "ultra").create();
    const envelope = new THREE.Box3().setFromObject(reference.group).getSize(new THREE.Vector3());
    reference.dispose();
    for (const quality of TREE_QUALITIES) {
      const variant = adoptedTree(species, quality);
      expect(variant.author).toBe(quality === "ultra" ? "Claude Opus 5.5" : "Codex GPT-6.1 Sol");
      const model = variant.create();
      const bounds = new THREE.Box3().setFromObject(model.group);
      const size = bounds.getSize(new THREE.Vector3());
      expect(bounds.min.y).toBeCloseTo(-0.35, 3);
      expect(size.y / envelope.y).toBeGreaterThan(0.92);
      expect(size.y / envelope.y).toBeLessThan(1.08);
      for (const axis of ["x", "z"] as const) {
        expect(size[axis] / envelope[axis]).toBeGreaterThan(0.8);
        expect(size[axis] / envelope[axis]).toBeLessThan(1.2);
      }
      const resources = new Set<THREE.BufferGeometry | THREE.Material>();
      for (const mesh of model.pickables) {
        resources.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(material);
        for (const name of ["position", "normal"]) {
          expect([...mesh.geometry.getAttribute(name).array].every(Number.isFinite)).toBe(true);
        }
      }
      const frees = [...resources].map(resource => vi.spyOn(resource, "dispose"));
      model.dispose();
      for (const free of frees) expect(free).toHaveBeenCalledOnce();
    }
  }
);

it.each(["western_red_cedar", "silver_fir", "date_palm", "umbrella_thorn", "saxaul", "tamarisk", "olive"] as const)(
  "retains fitted %s canopy normals and colors in the actual CE prototype",
  species => {
    const variant = adoptedTree(species, "medium");
    const source = variant.create();
    const cache = createBvPrototypeCache();
    const lease = cache.acquire({ id: variant.id, create: variant.create })!;
    expect(lease.material.side).toBe(THREE.DoubleSide);
    for (const name of ["normal", "color"] as const) {
      const expected = Float32Array.from(source.pickables.flatMap(mesh => [...mesh.geometry.getAttribute(name).array]));
      const actual = lease.geometry.getAttribute(name).array;
      expect(actual.length).toBe(expected.length);
      // Baking transforms and renormalizes normals; Float32 round-off must not count as lost shading.
      const error = expected.reduce((max, value, index) => Math.max(max, Math.abs(value - actual[index])), 0);
      expect(error).toBeLessThan(1e-6);
    }
    const free = vi.spyOn(lease.geometry, "dispose");
    source.dispose();
    lease.release();
    lease.release();
    expect(free).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
  }
);
