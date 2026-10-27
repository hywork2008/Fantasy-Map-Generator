import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createBvPrototypeCache } from "../../city3d/three/bvInstances";
import { meshProjection } from "../meshProjection";
import {
  createRegionalHouse,
  createRegionalHouseGeometry,
  createRegionalHouses,
  defaultRegionalHouseSpec,
  REGIONAL_HOUSES,
  type RegionalHouseProfile
} from "./regionalHouses";

const PROFILES: RegionalHouseProfile[] = [
  "mediterranean",
  "atlantic",
  "northern-wooded",
  "northern-urban",
  "stone-upland"
];

it.each(PROFILES)("%s direct CE geometry preserves the BV prototype's triangles, normals and colors", profile => {
  for (const [quality, roofForm] of [
    ["low", "gable"],
    ["high", "gable"],
    ["low", "hip"],
    ["high", "hip"]
  ] as const) {
    const spec = { ...defaultRegionalHouseSpec(profile, 1), roofForm };
    const cache = createBvPrototypeCache();
    const generic = cache.acquire({ id: "generic", create: () => createRegionalHouse(spec, quality) })!;
    const direct = createRegionalHouseGeometry(spec, quality);
    // Material buckets reorder triangles; compare complete oriented triangles, including vertex colors.
    const triangles = (geometry: THREE.BufferGeometry) => {
      const attributes = ["position", "normal", "color"].map(name => geometry.getAttribute(name));
      const result: string[] = [];
      for (let i = 0; i < attributes[0].count; i += 3) {
        const values: string[] = [];
        for (let v = i; v < i + 3; v++)
          for (const attribute of attributes)
            for (const value of [attribute.getX(v), attribute.getY(v), attribute.getZ(v)])
              values.push(value.toFixed(5));
        result.push(values.join(","));
      }
      return result.sort();
    };
    expect(triangles(direct)).toEqual(triangles(generic.geometry));
    direct.dispose();
    generic.release();
    expect(cache.size).toBe(0);
  }
});

it.each(PROFILES)("%s row keeps the CE envelope, roofs face the sky and resources release once", profile => {
  const model = createRegionalHouses(profile);
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-0.01);
  expect(bounds.max.x - bounds.min.x).toBeLessThan(REGIONAL_HOUSES.spacing * 2 + REGIONAL_HOUSES.width + 2.8);
  const hit = (x: number, z: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)).intersectObjects(model.pickables)[0];
  for (const x of [-8, 0, 8]) {
    // Mid-slope roof sits above the eave, below the ridge, and presents its outer face upward.
    const roof = hit(x + 1.4, 0.3);
    expect(roof.point.y).toBeGreaterThan(REGIONAL_HOUSES.ground + REGIONAL_HOUSES.upper);
    expect(roof.point.y).toBeLessThan(11);
    expect(roof.face!.normal.y).toBeGreaterThan(0);
  }
  for (const view of ["top", "side"] as const) expect(meshProjection(model, view)).not.toMatch(/NaN|Infinity/);
  expect(model.pickables.length).toBeLessThan(40);
  const disposals = model.pickables.map(mesh => vi.spyOn(mesh.geometry, "dispose"));
  const materials = new Set(model.pickables.flatMap(mesh => mesh.material));
  const materialDisposals = [...materials].map(material => vi.spyOn(material, "dispose"));
  model.dispose();
  for (const dispose of [...disposals, ...materialDisposals]) expect(dispose).toHaveBeenCalledTimes(1);
});

it.each(PROFILES)("%s low quality keeps the silhouette with far fewer triangles", profile => {
  const measure = (quality: "high" | "low") => {
    const model = createRegionalHouses(profile, quality);
    model.group.updateMatrixWorld(true);
    const triangles = model.pickables.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
    const bounds = new THREE.Box3().setFromObject(model.group);
    model.dispose();
    return { triangles, bounds };
  };
  const high = measure("high");
  const low = measure("low");
  expect(low.triangles).toBeLessThan(high.triangles / 4);
  expect(low.bounds.max.y).toBeGreaterThan(high.bounds.max.y - 1);
  expect(low.bounds.max.x - low.bounds.min.x).toBeGreaterThan(high.bounds.max.x - high.bounds.min.x - 0.5);
});

it("retains individual storey heights and cumulative jetties in the detailed factory", () => {
  const geometry = createRegionalHouseGeometry(
    {
      ...defaultRegionalHouseSpec("northern-urban", 0),
      width: 6,
      depth: 10,
      storeys: 3,
      floorHeights: [3.5, 2.6, 3.1],
      jetty: 0.2,
      attached: true,
      groundUse: "craft"
    },
    "high"
  );
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  // Probe wall panels away from windows/framing, from the east side.
  const wallX = (y: number) =>
    new THREE.Raycaster(new THREE.Vector3(20, y, 0.37), new THREE.Vector3(-1, 0, 0)).intersectObject(mesh)[0].point.x;
  expect(wallX(2.5)).toBeCloseTo(3);
  expect(wallX(3.8)).toBeCloseTo(3.2);
  expect(wallX(6.4)).toBeCloseTo(3.4);
  geometry.dispose();
  (mesh.material as THREE.Material).dispose();
});
