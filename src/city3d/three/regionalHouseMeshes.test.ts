import * as THREE from "three";
import { expect, it } from "vitest";
import type { BuildingAppearanceProfile } from "../../buildings/appearance/types";
import { buildingAppearancePreview } from "../../city-editor/generators/buildingAppearancePreview";
import { createBvPrototypeCache } from "./bvInstances";
import { createTownRegionalHouses } from "./regionalHouseMeshes";

const PROFILES: BuildingAppearanceProfile[] = [
  "mediterranean",
  "atlantic",
  "northern-wooded",
  "northern-urban",
  "stone-upland"
];

it("replaces regional lots with detailed houses that stay on their lot, and keeps legacy massing", () => {
  const cache = createBvPrototypeCache();
  for (const profile of PROFILES) {
    const lots = buildingAppearancePreview(profile);
    const layer = createTownRegionalHouses(lots, cache, () => 2);
    expect([...layer.replaced].sort()).toEqual([0, 1, 2]);
    for (const mesh of layer.pickables) {
      for (let i = 0; i < mesh.count; i++) {
        const site = layer.resolve({ object: mesh, instanceId: i })!;
        const lot = lots[site.lotIndex];
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(i, matrix);
        const bounds = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
        expect(bounds.min.y).toBeCloseTo(2, 5);
        // Walls fill the lot; only eaves, verges, steps and balconies may overhang it.
        const xs = lot.polygon.map(p => p[0]);
        const zs = lot.polygon.map(p => -p[1]);
        expect(bounds.min.x).toBeGreaterThan(Math.min(...xs) - 1.8);
        expect(bounds.max.x).toBeLessThan(Math.max(...xs) + 1.8);
        expect(bounds.min.z).toBeGreaterThan(Math.min(...zs) - 1.8);
        expect(bounds.max.z).toBeLessThan(Math.max(...zs) + 1.8);
        const eave = lot.massing!.eaveHeightMeters;
        expect(bounds.max.y - 2).toBeGreaterThan(eave + 2);
      }
    }
    layer.dispose();
  }
  const legacy = buildingAppearancePreview("legacy");
  const layer = createTownRegionalHouses(legacy, cache);
  expect(layer.replaced.size).toBe(0);
  layer.dispose();
  expect(cache.size).toBe(0);
});
