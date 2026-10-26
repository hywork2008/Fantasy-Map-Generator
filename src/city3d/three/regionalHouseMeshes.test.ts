import * as THREE from "three";
import { expect, it } from "vitest";
import type { BuildingAppearanceProfile } from "../../buildings/appearance/types";
import { buildingAppearancePreview } from "../../city-editor/generators/buildingAppearancePreview";
import { createBvPrototypeCache } from "./bvInstances";
import { createTownRegionalHouses, regionalHouseSite } from "./regionalHouseMeshes";

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

it("uses measured dimensions, floor heights, coverings and ground-floor use without stretching the BV model", () => {
  const lot = buildingAppearancePreview("northern-wooded")[0];
  lot.polygon = [
    [-3, -6],
    [3, -6],
    [3, 6],
    [-3, 6]
  ];
  lot.massing!.jettyMeters = 0;
  lot.massing!.storeys = 3;
  lot.massing!.floors = [
    { level: 0, use: "retail", heightMeters: 3.5 },
    { level: 1, use: "residential", heightMeters: 2.8 },
    { level: 2, use: "residential", heightMeters: 3.0 }
  ];
  lot.massing!.eaveHeightMeters = 9.3;
  lot.massing!.baseElevationMeters = 1;
  lot.massing!.roof.pitchDeg = 28;
  const cache = createBvPrototypeCache();
  for (const material of ["turf", "shingle", "slate", "lead", "thatch", "tile"] as const) {
    lot.massing!.roof.material = material;
    const site = regionalHouseSite(lot, 7, 12, "high")!;
    const scale = new THREE.Vector3().setFromMatrixScale(site.matrix);
    expect(scale.toArray()).toEqual([1, 1, 1]);
    const prototype = cache.acquire(site.definition)!;
    // The main ridge/eave intersection remains at the measured slope, with no pitch quantization.
    const ray = new THREE.Raycaster(new THREE.Vector3(2, 30, 0), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(new THREE.Mesh(prototype.geometry, prototype.material))[0];
    expect(hit).toBeDefined();
    if (material === "lead")
      expect(Math.abs(hit.face!.normal.x / hit.face!.normal.y)).toBeCloseTo(Math.tan((28 * Math.PI) / 180), 1);
    const bounds = prototype.bounds.clone().applyMatrix4(site.matrix);
    expect(bounds.min.y).toBeCloseTo(13);
    expect(bounds.max.y).toBeGreaterThan(13 + 9.3);
    expect(bounds.max.x - bounds.min.x).toBeLessThan(6.6);
    expect(bounds.max.z - bounds.min.z).toBeLessThan(12.6);
    // Different coverings and uses must never reuse a stale prototype.
    lot.massing!.floors[0].use = "craft";
    expect(regionalHouseSite(lot, 7, 12, "high")!.definition).not.toBe(site.definition);
    lot.massing!.floors[0].use = "retail";
    prototype.release();
  }
  expect(cache.size).toBe(0);
});

it("keeps outbuildings, trapezoids, unsupported floors and roof forms in CE massing", () => {
  const lot = buildingAppearancePreview("atlantic")[0];
  for (const role of ["stable", "shed"] as const) {
    expect(regionalHouseSite({ ...lot, role }, 0)).toBeUndefined();
  }
  // The old 80% area test admitted this footprint although the bounding-box corners lay outside it.
  expect(
    regionalHouseSite(
      {
        ...lot,
        polygon: [
          [-2.5, -4],
          [2.5, -4],
          [2, 4],
          [-2, 4]
        ]
      },
      0
    )
  ).toBeUndefined();
  expect(regionalHouseSite({ ...lot, massing: { ...lot.massing!, storeys: 6 } }, 0)).toBeUndefined();
  expect(regionalHouseSite({ ...lot, massing: { ...lot.massing!, eaveHeightMeters: 20 } }, 0)).toBeUndefined();
  expect(
    regionalHouseSite({ ...lot, massing: { ...lot.massing!, roof: { ...lot.massing!.roof, form: "flat" } } }, 0)
  ).toBeUndefined();
});
