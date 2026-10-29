import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { models } from "../medieval/43-landscape-treesModels";
import { meshProjection } from "../meshProjection";
import { TREE_QUALITIES } from "./treeQuality";
import { createLandscapeTree, treeLodProfile } from "./trees";

it("keeps a compact evergreen lemon crown within its BV envelope and releases each tier's resources", () => {
  const definition = models.find(model => model.id === "lemon")!;
  expect(definition.biomes).toBeUndefined();
  expect(treeLodProfile("lemon")).toMatchObject({ selection: "pixels", budget: "bounded" });
  const fig = createLandscapeTree("common_fig", "high");
  const figSize = new THREE.Box3().setFromObject(fig.group).getSize(new THREE.Vector3());
  fig.dispose();
  const limits = { low: 500, medium: 3000, high: 25000, ultra: 120000 };
  for (const quality of TREE_QUALITIES) {
    const model = createLandscapeTree("lemon", quality);
    try {
      const bounds = new THREE.Box3().setFromObject(model.group);
      const size = bounds.getSize(new THREE.Vector3());
      expect(size.y).toBeLessThan(figSize.y * 0.85);
      expect(Math.max(size.x, size.z)).toBeLessThan(Math.max(figSize.x, figSize.z) * 0.6);
      expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) * 2).toBeLessThanOrEqual(definition.size[0]);
      expect(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) * 2).toBeLessThanOrEqual(definition.size[1]);
      expect(bounds.max.y).toBeLessThanOrEqual(definition.size[2]);
      const resources = new Set<THREE.BufferGeometry | THREE.Material>();
      let triangles = 0;
      for (const mesh of model.pickables) {
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
        resources.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(material);
        for (const name of ["position", "normal", "color"])
          expect([...mesh.geometry.getAttribute(name).array].every(Number.isFinite)).toBe(true);
      }
      expect(triangles).toBeLessThanOrEqual(limits[quality]);
      expect(model.pickables.length).toBeLessThanOrEqual(3);
      const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
      model.dispose();
      for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    } catch (error) {
      model.dispose();
      throw error;
    }
  }
});

it("retains the lemon fruit envelope across detailed tiers and simplifies distant fruit", () => {
  const trees = TREE_QUALITIES.map(quality => createLandscapeTree("lemon", quality));
  try {
    const fruit = trees.map(
      tree => tree.group.getObjectByName("lemon-yellow-elliptical-fruit-with-apical-nipples") as THREE.Mesh | undefined
    );
    expect(fruit[0]).toBeUndefined();
    expect(fruit[1]).toBeDefined();
    const high = new THREE.Box3().setFromObject(fruit[2]!);
    const ultra = new THREE.Box3().setFromObject(fruit[3]!);
    expect(high.min.distanceTo(ultra.min)).toBeLessThan(0.02);
    expect(high.max.distanceTo(ultra.max)).toBeLessThan(0.02);
    const crown = new THREE.Box3().setFromObject(trees[3].pickables[1]);
    expect(crown.containsBox(ultra)).toBe(true);
    const count = (mesh: THREE.Mesh) => mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count;
    expect(count(fruit[1]!)).toBeLessThan(count(fruit[2]!));
    expect(count(fruit[2]!)).toBeLessThan(count(fruit[3]!));
  } finally {
    for (const tree of trees) tree.dispose();
  }
});

it.each(["high", "ultra"] as const)("includes the %s lemon foliage in BV's top drawing", quality => {
  const model = createLandscapeTree("lemon", quality);
  try {
    const crown = model.pickables[1];
    const drawing = meshProjection({ ...model, pickables: [crown] }, "top");
    expect(drawing.match(/<path /g)?.length ?? 0).toBeGreaterThan(crown.geometry.getAttribute("position").count / 6);
  } finally {
    model.dispose();
  }
});
