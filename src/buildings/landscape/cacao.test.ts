import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { models } from "../medieval/43-landscape-treesModels";
import { meshProjection } from "../meshProjection";
import { TREE_QUALITIES } from "./treeQuality";
import { createLandscapeTree, treeLodProfile } from "./trees";

it("keeps a cultivated cacao crown within its BV envelope and releases each tier's resources", () => {
  const definition = models.find(model => model.id === "cacao")!;
  expect(definition.biomes).toBeUndefined();
  expect(treeLodProfile("cacao")).toMatchObject({ selection: "pixels", budget: "bounded" });
  const limits = { low: 500, medium: 3000, high: 25000, ultra: 120000 };
  for (const quality of TREE_QUALITIES) {
    const model = createLandscapeTree("cacao", quality);
    try {
      const bounds = new THREE.Box3().setFromObject(model.group);
      const size = bounds.getSize(new THREE.Vector3());
      expect(size.y).toBeGreaterThan(4);
      expect(Math.max(size.x, size.z)).toBeGreaterThan(5);
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

it("retains the cacao pod envelope across detailed tiers and simplifies distant fruit", () => {
  const trees = TREE_QUALITIES.map(quality => createLandscapeTree("cacao", quality));
  try {
    const fruit = trees.map(
      tree => tree.group.getObjectByName("cacao-ridged-cauliflorous-pods") as THREE.Mesh | undefined
    );
    expect(fruit[0]).toBeUndefined();
    expect(fruit[1]).toBeDefined();
    const high = new THREE.Box3().setFromObject(fruit[2]!);
    const ultra = new THREE.Box3().setFromObject(fruit[3]!);
    expect(high.min.distanceTo(ultra.min)).toBeLessThan(0.02);
    expect(high.max.distanceTo(ultra.max)).toBeLessThan(0.02);
    // Cauliflorous pods stay low on the bole and older scaffold branches, not the leafy tips.
    expect(ultra.min.y).toBeLessThan(0.7);
    expect(ultra.max.y).toBeLessThan(2.2);
    expect(
      Math.max(Math.abs(ultra.min.x), Math.abs(ultra.max.x), Math.abs(ultra.min.z), Math.abs(ultra.max.z))
    ).toBeLessThan(1.1);
    const count = (mesh: THREE.Mesh) => mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count;
    expect(count(fruit[1]!)).toBeLessThan(count(fruit[2]!));
    expect(count(fruit[2]!)).toBeLessThan(count(fruit[3]!));
  } finally {
    for (const tree of trees) tree.dispose();
  }
});

it.each(["high", "ultra"] as const)("includes the %s cacao foliage in BV's top drawing", quality => {
  const model = createLandscapeTree("cacao", quality);
  try {
    const crown = model.pickables[1];
    const drawing = meshProjection({ ...model, pickables: [crown] }, "top");
    expect(drawing.match(/<path /g)?.length ?? 0).toBeGreaterThan(crown.geometry.getAttribute("position").count / 6);
  } finally {
    model.dispose();
  }
});
