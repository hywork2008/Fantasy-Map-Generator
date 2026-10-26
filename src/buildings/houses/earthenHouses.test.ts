import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createBvPrototypeCache } from "../../city3d/three/bvInstances";
import { createEarthenHouse, createEarthenHouseGeometry, defaultEarthenHouseSpec } from "./earthenHouses";

it.each([false, true])(
  "keeps a trapezoidal terrace inside its walls with an open roof parapet (reversed: %s)",
  reversed => {
    const spec = defaultEarthenHouseSpec(1);
    if (reversed) spec.footprint = [...spec.footprint].reverse();
    const geometry = createEarthenHouseGeometry(spec, "high");
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const down = (x: number, z: number) =>
      new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh);
    const terrace = down(0, 0)[0];
    expect(terrace.point.y).toBeCloseTo(6.22, 4);
    expect(terrace.face!.normal.y).toBeGreaterThan(0.99);
    expect(down(0, -3.95)[0].point.y).toBeCloseTo(6.64, 4);
    // This point is inside the bounding rectangle but outside the measured trapezoid.
    expect(down(2.45, 3)).toHaveLength(0);
    for (const name of ["position", "normal", "color"])
      expect([...geometry.getAttribute(name).array].every(Number.isFinite)).toBe(true);
    geometry.dispose();
    material.dispose();
  }
);

it("keeps the terrace silhouette at low quality and shares identical BV/CE geometry", () => {
  const spec = defaultEarthenHouseSpec(2);
  const high = createEarthenHouseGeometry(spec, "high");
  const low = createEarthenHouseGeometry(spec, "low");
  expect(high.getAttribute("position").count).toBeGreaterThan(low.getAttribute("position").count * 2);
  expect(high.boundingBox!.max.y).toBeCloseTo(low.boundingBox!.max.y);
  const cache = createBvPrototypeCache();
  const bv = cache.acquire({ id: "earthen-test", create: () => createEarthenHouse(spec, "high") })!;
  for (const name of ["position", "normal", "color"])
    expect([...bv.geometry.getAttribute(name).array]).toEqual([...high.getAttribute(name).array]);
  bv.release();
  expect(cache.size).toBe(0);
  high.dispose();
  low.dispose();
});

it("releases the BV model's owned geometry and material", () => {
  const model = createEarthenHouse(defaultEarthenHouseSpec(0));
  const mesh = model.pickables[0];
  const geometry = vi.spyOn(mesh.geometry, "dispose");
  const material = vi.spyOn(mesh.material as THREE.Material, "dispose");
  model.dispose();
  expect(geometry).toHaveBeenCalledOnce();
  expect(material).toHaveBeenCalledOnce();
});
