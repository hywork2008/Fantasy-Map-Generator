import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { meshProjection } from "../meshProjection";
import { createRegionalHouses, REGIONAL_HOUSES, type RegionalHouseProfile } from "./regionalHouses";

const PROFILES: RegionalHouseProfile[] = [
  "mediterranean",
  "atlantic",
  "northern-wooded",
  "northern-urban",
  "stone-upland"
];

it.each(PROFILES)("%s row keeps the CE envelope, roofs face the sky and resources release once", profile => {
  const model = createRegionalHouses(profile);
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-0.01);
  expect(bounds.max.x - bounds.min.x).toBeLessThan(REGIONAL_HOUSES.spacing * 2 + REGIONAL_HOUSES.width + 2);
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
