import * as THREE from "three";
import { expect, it } from "vitest";
import input from "../../city-editor/data/fixtures/vegides-20261026.json";
import { buildBlockFabric } from "../../city-editor/generators/blockInfill";
import { generateCityOnDocument } from "../../city-editor/generators/generation/generateCity";
import { parseIncomingPayload } from "../../city-editor/services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../../city-editor/services/io/shareRequest";
import { createBvPrototypeCache } from "./bvInstances";
import { createTownRegionalHouses } from "./regionalHouseMeshes";

it("replaces every Vegides mudbrick house with the shared detailed BV model at high quality", () => {
  const share = parseIncomingPayload(JSON.stringify(input))!;
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed)!;
  expect(city).not.toBeNull();
  const lots = buildBlockFabric(city).buildings;
  expect(lots.length).toBeGreaterThan(0);
  const cache = createBvPrototypeCache();
  const layer = createTownRegionalHouses(lots, cache, () => 12, "high");
  expect(layer.replaced.size).toBe(lots.length);
  for (const mesh of layer.pickables) {
    for (let i = 0; i < mesh.count; i++) {
      const site = layer.resolve({ object: mesh, instanceId: i })!;
      const lot = lots[site.lotIndex];
      expect(site.definition.id).toMatch(/^earthen-house:.*\|high$/);
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(i, matrix);
      const bounds = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
      expect(bounds.min.y).toBeCloseTo(12 + lot.massing!.baseElevationMeters, 4);
      // The parapet follows the polygon; only facade trim and the scupper may project beyond it.
      const xs = lot.polygon.map(p => p[0]);
      const zs = lot.polygon.map(p => -p[1]);
      expect(bounds.min.x).toBeGreaterThanOrEqual(Math.min(...xs) - 0.35);
      expect(bounds.max.x).toBeLessThanOrEqual(Math.max(...xs) + 0.35);
      expect(bounds.min.z).toBeGreaterThanOrEqual(Math.min(...zs) - 0.35);
      expect(bounds.max.z).toBeLessThanOrEqual(Math.max(...zs) + 0.35);
      expect(bounds.max.y).toBeCloseTo(12 + lot.massing!.baseElevationMeters + lot.massing!.eaveHeightMeters + 0.54, 4);
    }
  }
  layer.dispose();
  expect(cache.size).toBe(0);
});
