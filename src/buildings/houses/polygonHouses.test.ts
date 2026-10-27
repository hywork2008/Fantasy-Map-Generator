import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createPolygonHouse, createPolygonHouseGeometry, defaultPolygonHouseSpec } from "./polygonHouses";

it.each([0, 1, 2] as const)("keeps polygon variant %s walls and roof in BV and both quality levels", variant => {
  const spec = defaultPolygonHouseSpec(variant);
  const high = createPolygonHouseGeometry(spec, "high");
  const low = createPolygonHouseGeometry(spec, "low");
  expect(high.getAttribute("position").count).toBeGreaterThan(low.getAttribute("position").count);
  for (const geometry of [high, low]) {
    for (const name of ["position", "normal", "color"])
      expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    const ray = (x: number, z: number) =>
      new THREE.Raycaster(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
    const hit = ray(0.8, 0.3)!;
    expect(hit).toBeDefined();
    expect(hit.face!.normal.y).toBeGreaterThan(0);
    if (variant < 2) expect(hit.point.y).toBeGreaterThan(spec.massing.eaveHeightMeters);
    else {
      expect(hit.point.y).toBeCloseTo(spec.massing.eaveHeightMeters);
      expect(ray(-1.5, -3)).toBeUndefined();
    }
    // A door actually faces the selected front wall, independently of the roof ridge.
    const door = new THREE.Raycaster(new THREE.Vector3(0.02, 1, 5), new THREE.Vector3(0, 0, -1)).intersectObject(
      mesh
    )[0]!;
    expect(door).toBeDefined();
    const color = geometry.getAttribute("color");
    const brown = new THREE.Color("#5A3B26");
    expect(color.getX(door.face!.a)).toBeCloseTo(brown.r);
    mesh.material.dispose();
  }
  const model = createPolygonHouse(spec, "high");
  expect(model.pickables[0].geometry.getAttribute("position").array).toEqual(high.getAttribute("position").array);
  const dispose = vi.spyOn(model.pickables[0].geometry, "dispose");
  model.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  high.dispose();
  low.dispose();
});
