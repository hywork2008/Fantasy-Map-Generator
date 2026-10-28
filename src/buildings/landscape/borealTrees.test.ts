import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createTownOpenSpaces } from "../../city3d/three/openSpaceMeshes";
import { models } from "../medieval/43-landscape-treesModels";
import { createLandscapeTree } from "./trees";

it.each(["norway_spruce", "silver_birch", "date_palm", "umbrella_thorn", "saxaul", "kapok"] as const)(
  "registers and instances the grounded %s model with foliage colours",
  species => {
    const definition = models.find(model => model.id === species.replaceAll("_", "-"))!;
    expect(definition.biomes?.length).toBeGreaterThan(0);
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
  }
);
