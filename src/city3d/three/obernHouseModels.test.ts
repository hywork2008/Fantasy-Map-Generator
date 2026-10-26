import * as THREE from "three";
import { expect, it } from "vitest";
import input from "../../city-editor/data/fixtures/obern-20261027.json";
import { buildBlockFabric } from "../../city-editor/generators/blockInfill";
import { generateCityOnDocument } from "../../city-editor/generators/generation/generateCity";
import { parseIncomingPayload } from "../../city-editor/services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../../city-editor/services/io/shareRequest";
import { createBvPrototypeCache } from "./bvInstances";
import { regionalHouseSite } from "./regionalHouseMeshes";

it("covers every Obern #93 house, including narrow, skew and concave footprints", () => {
  const share = parseIncomingPayload(JSON.stringify(input))!;
  expect(share.seed).toBe("6851550440093");
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed)!;
  const lots = buildBlockFabric(city).buildings;
  expect(lots.length).toBe(2330);
  const sites = lots.map((lot, i) => regionalHouseSite(lot, i, 12, "high"));
  expect(sites.filter(Boolean)).toHaveLength(lots.length);
  const polygon = sites.filter(site => site!.definition.id.startsWith("polygon-house:"));
  expect(polygon).toHaveLength(1304);
  // Exercise actual BV prototypes for a narrow rectangle, skew hip/gable, and the concave flat roof.
  const samples = new Set([
    ...["gable", "hip", "flat"].map(form => polygon.find(site => lots[site!.lotIndex].massing!.roof.form === form)),
    polygon[0],
    polygon[7]
  ]);
  const cache = createBvPrototypeCache();
  for (const site of samples) {
    expect(site).toBeDefined();
    const lot = lots[site!.lotIndex];
    const prototype = cache.acquire(site!.definition)!;
    expect(prototype).toBeDefined();
    const bounds = prototype.bounds.clone().applyMatrix4(site!.matrix);
    expect(bounds.min.y).toBeCloseTo(12 + lot.massing!.baseElevationMeters, 4);
    const xs = lot.polygon.map(p => p[0]),
      zs = lot.polygon.map(p => -p[1]);
    expect(bounds.min.x).toBeGreaterThanOrEqual(Math.min(...xs) - 0.2);
    expect(bounds.max.x).toBeLessThanOrEqual(Math.max(...xs) + 0.2);
    expect(bounds.min.z).toBeGreaterThanOrEqual(Math.min(...zs) - 0.2);
    expect(bounds.max.z).toBeLessThanOrEqual(Math.max(...zs) + 0.2);
    expect(new THREE.Vector3().setFromMatrixScale(site!.matrix).toArray()).toEqual([1, 1, 1]);
    for (const name of ["position", "normal", "color"]) {
      expect(Array.from(prototype.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    }
    prototype.release();
  }
  expect(cache.size).toBe(0);
}, 30000);
