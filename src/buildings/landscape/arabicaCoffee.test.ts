import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { models } from "../medieval/43-landscape-treesModels";
import { meshProjection } from "../meshProjection";
import { TREE_QUALITIES } from "./treeQuality";
import { createLandscapeTree, treeLodProfile } from "./trees";

it("keeps a cultivated Arabica coffee crown within its BV envelope and releases each tier's resources", () => {
  const definition = models.find(model => model.id === "arabica-coffee")!;
  expect(definition.biomes).toBeUndefined();
  expect(treeLodProfile("arabica_coffee")).toMatchObject({ selection: "pixels", budget: "bounded" });
  const limits = { low: 500, medium: 3000, high: 25000, ultra: 120000 };
  for (const quality of TREE_QUALITIES) {
    const model = createLandscapeTree("arabica_coffee", quality);
    try {
      const bounds = new THREE.Box3().setFromObject(model.group);
      const size = bounds.getSize(new THREE.Vector3());
      expect(size.y).toBeGreaterThan(2.5);
      expect(Math.max(size.x, size.z)).toBeGreaterThan(1.5);
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

it("retains the coffee cherry envelope across detailed tiers and simplifies distant fruit", () => {
  const trees = TREE_QUALITIES.map(quality => createLandscapeTree("arabica_coffee", quality));
  try {
    const fruit = trees.map(
      tree => tree.group.getObjectByName("arabica-coffee-red-cherries-at-lateral-nodes") as THREE.Mesh | undefined
    );
    expect(fruit[0]).toBeUndefined();
    expect(fruit[1]).toBeDefined();
    const high = new THREE.Box3().setFromObject(fruit[2]!);
    const ultra = new THREE.Box3().setFromObject(fruit[3]!);
    expect(high.min.distanceTo(ultra.min)).toBeLessThan(0.02);
    expect(high.max.distanceTo(ultra.max)).toBeLessThan(0.02);
    // Cherries follow lateral nodes over several levels rather than forming a bole-borne pod display.
    expect(ultra.min.y).toBeGreaterThan(0.5);
    expect(ultra.max.y).toBeGreaterThan(2);
    expect(ultra.max.x - ultra.min.x).toBeGreaterThan(1);
    const count = (mesh: THREE.Mesh) => mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count;
    expect(count(fruit[1]!)).toBeLessThan(count(fruit[2]!));
    expect(count(fruit[2]!)).toBeLessThan(count(fruit[3]!));
  } finally {
    for (const tree of trees) tree.dispose();
  }
});

it.each(["high", "ultra"] as const)("includes the %s coffee foliage in BV's top drawing", quality => {
  const model = createLandscapeTree("arabica_coffee", quality);
  try {
    const crown = model.pickables[1];
    const drawing = meshProjection({ ...model, pickables: [crown] }, "top");
    expect(drawing.match(/<path /g)?.length ?? 0).toBeGreaterThan(crown.geometry.getAttribute("position").count / 6);
  } finally {
    model.dispose();
  }
});

it.each(["high", "ultra"] as const)("keeps %s coffee leaves in opposite pairs at shared nodes", quality => {
  const tree = createLandscapeTree("arabica_coffee", quality);
  try {
    const p = tree.pickables[1].geometry.getAttribute("position");
    const leaves: { base: THREE.Vector3; ridge: THREE.Vector3 }[] = [];
    // Each folded leaf is a fan whose triangles share the second vertex at its ridge.
    for (let i = 0; i < p.count; i += 3) {
      const ridge = new THREE.Vector3().fromBufferAttribute(p, i + 1);
      if (!leaves.at(-1)?.ridge.equals(ridge))
        leaves.push({ base: new THREE.Vector3().fromBufferAttribute(p, i), ridge });
    }
    expect(leaves.length).toBeGreaterThan(400);
    expect(leaves.length % 2).toBe(0);
    for (let i = 0; i < leaves.length; i += 2) {
      const a = leaves[i],
        b = leaves[i + 1];
      expect(a.base.distanceTo(b.base)).toBeLessThan(0.035);
      expect(
        a.ridge.clone().sub(a.base).setY(0).normalize().dot(b.ridge.clone().sub(b.base).setY(0).normalize())
      ).toBeLessThan(-0.95);
    }
  } finally {
    tree.dispose();
  }
});
