import * as THREE from "three";
import { expect, it } from "vitest";
import { adoptedTree } from "../../city3d/adoption";
import { models } from "../medieval/43-landscape-treesModels";
import { TREE_QUALITIES, treeQualityAtPixels } from "./treeQuality";
import { createLandscapeTree } from "./trees";

it.each(["garden_parkland", "sacred_yew"] as const)(
  "adopts four increasingly detailed, grounded %s levels from the BV variants",
  species => {
    const variants = models.find(model => model.id === species.replaceAll("_", "-"))!.variants!;
    expect([...new Set(variants.map(variant => variant.level))]).toEqual(TREE_QUALITIES);
    let previous = 0;
    for (const level of TREE_QUALITIES) {
      const variant = adoptedTree(species, level);
      expect(variants.map(entry => entry.id)).toContain(variant.id);
      const model = variant.create();
      const triangles = model.pickables.reduce(
        (sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3,
        0
      );
      expect(triangles).toBeGreaterThan(previous);
      if (level === "low") expect(triangles).toBeLessThan(500);
      if (level === "medium") expect(triangles).toBeLessThan(3000);
      const bounds = new THREE.Box3().setFromObject(model.group);
      expect(bounds.min.y).toBeCloseTo(-0.35, 3);
      expect(bounds.max.y).toBeGreaterThan(species === "garden_parkland" ? 10 : 6.5);
      for (const mesh of model.pickables) {
        for (const coordinate of mesh.geometry.getAttribute("position").array)
          expect(Number.isFinite(coordinate)).toBe(true);
      }
      previous = triangles;
      model.dispose();
    }
    const legacy = createLandscapeTree(species);
    expect(legacy.group.userData.treeQuality).toBe("ultra");
    legacy.dispose();
  }
);

it("retains tiers across small pixel changes and responds to camera zoom", () => {
  expect([15, 50, 150, 300].map(pixels => treeQualityAtPixels(pixels))).toEqual(TREE_QUALITIES);
  expect(treeQualityAtPixels(220, "ultra")).toBe("ultra");
  expect(treeQualityAtPixels(180, "ultra")).toBe("high");
  expect(treeQualityAtPixels(85, "high")).toBe("high");
  expect(treeQualityAtPixels(65, "high")).toBe("medium");
});

it.each(["garden_parkland", "sacred_yew"] as const)(
  "keeps structural branches fixed between high and ultra %s",
  species => {
    const high = createLandscapeTree(species, "high");
    const ultra = createLandscapeTree(species, "ultra");
    expect(high.pickables[0].geometry.getAttribute("position").array).toEqual(
      ultra.pickables[0].geometry.getAttribute("position").array
    );
    high.dispose();
    ultra.dispose();
  }
);
