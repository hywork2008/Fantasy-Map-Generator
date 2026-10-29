import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createTownOpenSpaces } from "../../city3d/three/openSpaceMeshes";
import { models } from "../medieval/43-landscape-treesModels";
import { meshProjection } from "../meshProjection";
import { TREE_QUALITIES } from "./treeQuality";
import { createLandscapeTree } from "./trees";

it.each(["olive", "date_palm"] as const)("covers every %s tier with the BV's declared envelope", species => {
  const definition = models.find(model => model.id === species.replaceAll("_", "-"))!;
  for (const quality of TREE_QUALITIES) {
    const model = createLandscapeTree(species, quality);
    try {
      const bounds = new THREE.Box3().setFromObject(model.group);
      expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) * 2).toBeLessThanOrEqual(definition.size[0]);
      expect(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) * 2).toBeLessThanOrEqual(definition.size[1]);
      expect(bounds.max.y).toBeLessThanOrEqual(definition.size[2]);
    } finally {
      model.dispose();
    }
  }
});

it("includes date_palm low fronds in BV's top drawing", () => {
  const model = createLandscapeTree("date_palm", "low");
  try {
    const crown = model.pickables[1];
    const drawing = meshProjection({ ...model, pickables: [crown] }, "top");
    expect(drawing.match(/<path /g)?.length ?? 0).toBeGreaterThan(crown.geometry.getAttribute("position").count / 6);
  } finally {
    model.dispose();
  }
});

it.each(["norway_spruce", "silver_birch"] as const)(
  "retains the %s envelope and releases all four tiers' owned resources",
  species => {
    const reference = createLandscapeTree(species, "ultra");
    const envelope = new THREE.Box3().setFromObject(reference.group).getSize(new THREE.Vector3());
    reference.dispose();
    for (const quality of TREE_QUALITIES) {
      const model = createLandscapeTree(species, quality);
      const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
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
          for (const value of mesh.geometry.getAttribute(name).array) expect(Number.isFinite(value)).toBe(true);
        }
      }
      const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
      model.dispose();
      for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    }
  }
);

it.each([
  "norway_spruce",
  "silver_birch",
  "date_palm",
  "umbrella_thorn",
  "saxaul",
  "kapok",
  "western_red_cedar",
  "black_alder",
  "olive",
  "silver_fir",
  "red_mangrove",
  "tamarisk",
  "rowan",
  "canary_pine",
  "mediterranean_cypress",
  "oriental_evergreen",
  "sacred_bodhi_and_fig",
  "peaceful_willow"
] as const)("registers and instances the grounded %s model with foliage colours", species => {
  const definition = models.find(model => model.id === species.replaceAll("_", "-"))!;
  expect(definition.author).toBeDefined();
  const a = definition.create(),
    b = createLandscapeTree(species);
  const box = new THREE.Box3().setFromObject(a.group);
  expect(box.min.y).toBeCloseTo(-0.35, 3);
  expect(box.max.y).toBeGreaterThan(definition.size![2] * 0.8);
  expect(box.max.y).toBeLessThan(definition.size![2]);
  for (const [i, mesh] of a.pickables.entries()) {
    expect(mesh.geometry).not.toBe(b.pickables[i].geometry);
    expect(mesh.geometry.getAttribute("position").array).toEqual(
      b.pickables[i].geometry.getAttribute("position").array
    );
    expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
  }
  const resources = a.pickables.flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]);
  const spies = resources.map(resource => vi.spyOn(resource, "dispose"));
  a.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  b.dispose();
  const layer = createTownOpenSpaces({
    surfaces: [],
    sites: [{ model: species, point: [0, 0], angle: 0, radius: 3 }]
  });
  expect(layer.pickables.every(mesh => mesh.geometry.getAttribute("color"))).toBe(true);
  expect(layer.pickables.every(mesh => (mesh as THREE.InstancedMesh).count === 1)).toBe(true);
  layer.dispose();
});
